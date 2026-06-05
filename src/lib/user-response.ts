import { prisma } from "@/lib/prisma";

export type UserResponseStat = {
    medianMinutes: number;
    sampleCount: number;
};

// Compute how quickly a user typically replies to messages they receive,
// derived from the most recent conversations they're a participant in. Works
// for any user (buyer or seller perspective), not just sellers. Caps each
// reply delta at 48h so a single weekend AFK doesn't skew the median, and
// requires at least 3 samples before publishing a number so we don't show
// noise for newly-active users.
const MAX_CONVERSATIONS_TO_SAMPLE = 30;
const MAX_DELTA_MINUTES = 48 * 60;
const MIN_SAMPLES = 3;

type ConversationDelegate = {
    findMany: (args: unknown) => Promise<Array<{ messages: Array<{ sender_id: string; created_at: Date }> }>>;
};

function getConversationDelegate(): ConversationDelegate | undefined {
    return (prisma as unknown as { conversation?: ConversationDelegate }).conversation;
}

export async function getUserResponseStat(userId: string): Promise<UserResponseStat | null> {
    if (!userId) return null;

    const delegate = getConversationDelegate();
    if (!delegate) return null;

    let conversations: Array<{ messages: Array<{ sender_id: string; created_at: Date }> }>;
    try {
        conversations = await delegate.findMany({
            where: { OR: [{ buyer_id: userId }, { seller_id: userId }] },
            orderBy: { updated_at: "desc" },
            take: MAX_CONVERSATIONS_TO_SAMPLE,
            select: {
                messages: {
                    orderBy: { created_at: "asc" },
                    select: { sender_id: true, created_at: true },
                },
            },
        });
    } catch (err) {
        console.warn("getUserResponseStat: conversation query failed", err);
        return null;
    }

    const deltasMinutes: number[] = [];
    for (const conv of conversations) {
        const msgs = conv.messages;
        for (let i = 1; i < msgs.length; i++) {
            const prev = msgs[i - 1];
            const curr = msgs[i];
            // Only count a delta when the OTHER party messaged first and this
            // user replied next — that's a real "response," not a follow-up
            // burst from the same person.
            if (prev.sender_id !== userId && curr.sender_id === userId) {
                const deltaMs = curr.created_at.getTime() - prev.created_at.getTime();
                const deltaMin = Math.max(0, Math.floor(deltaMs / 60_000));
                deltasMinutes.push(Math.min(deltaMin, MAX_DELTA_MINUTES));
            }
        }
    }

    if (deltasMinutes.length < MIN_SAMPLES) return null;

    deltasMinutes.sort((a, b) => a - b);
    const mid = Math.floor(deltasMinutes.length / 2);
    const medianMinutes = deltasMinutes.length % 2 === 1
        ? deltasMinutes[mid]
        : Math.round((deltasMinutes[mid - 1] + deltasMinutes[mid]) / 2);

    return { medianMinutes, sampleCount: deltasMinutes.length };
}
