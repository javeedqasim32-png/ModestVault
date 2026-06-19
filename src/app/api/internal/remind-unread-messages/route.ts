import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendUnreadMessagesReminderEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * Cron-driven reminder for direct messages that haven't been opened
 * within 24 hours of arrival.
 *
 *   1. Pulls every ConversationMessage where read_at IS NULL,
 *      reminder_sent_at IS NULL, and created_at < NOW() - 24h.
 *   2. Groups by recipient (the conversation party who isn't the sender).
 *   3. Sends one digest email per recipient summarizing all aged
 *      unread messages.
 *   4. Stamps reminder_sent_at on every included message so future
 *      cron passes skip them — the email never fires twice for the
 *      same message.
 *
 * Auth: `x-cron-secret` header against INTERNAL_CRON_SECRET. Same as
 * /api/internal/dispatch-push-notifications.
 *
 * Recommended schedule: hourly (`0 * * * *` in EC2 crontab).
 *
 * Idempotency: relies on reminder_sent_at; safe to invoke repeatedly.
 */
function isAuthorized(request: Request) {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    const provided = request.headers.get("x-cron-secret");
    return provided === expected;
}

// Soft cap so a backlog doesn't blow up the request. Anything left
// over picks up on the next hourly run.
const MAX_PER_RUN = 500;

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Single round-trip — pull every aged unread message plus the
    // conversation parties so we can compute recipient + sender name
    // without a second query per row.
    const aged = await prisma.conversationMessage.findMany({
        where: {
            read_at: null,
            reminder_sent_at: null,
            created_at: { lt: cutoff },
        },
        take: MAX_PER_RUN,
        orderBy: { created_at: "asc" },
        include: {
            sender: { select: { first_name: true, last_name: true } },
            conversation: {
                select: {
                    id: true,
                    buyer_id: true,
                    seller_id: true,
                    buyer: { select: { id: true, email: true, is_admin: true } },
                    seller: { select: { id: true, email: true, is_admin: true } },
                },
            },
        },
    });

    if (aged.length === 0) {
        return NextResponse.json({ scanned: 0, emailed: 0, recipients: 0 });
    }

    const appUrl = await getAppUrl();

    type DigestItem = {
        from: string;
        snippet: string;
        conversationUrl: string;
        messageId: string;
    };
    // recipientId → { email, items[] }
    const byRecipient = new Map<
        string,
        { email: string; items: DigestItem[] }
    >();

    for (const msg of aged) {
        const conv = msg.conversation;
        const isFromBuyer = msg.sender_id === conv.buyer_id;
        const recipient = isFromBuyer ? conv.seller : conv.buyer;

        // Defensive: skip if recipient has no email (shouldn't happen —
        // email is required at signup — but the data isn't enforced).
        if (!recipient?.email) continue;
        // Don't email admins about messages they're a party to — admin
        // self-replies and the founding-support thread otherwise spam.
        if (recipient.is_admin) continue;

        const fromName =
            [msg.sender?.first_name, msg.sender?.last_name]
                .filter((s): s is string => !!s && s.trim().length > 0)
                .join(" ")
                .trim() || "Someone";
        const snippet = (msg.body ?? "").trim() || "Sent you a photo";

        const bucket = byRecipient.get(recipient.id) ?? {
            email: recipient.email,
            items: [],
        };
        bucket.items.push({
            from: fromName,
            snippet,
            conversationUrl: `${appUrl}/messages/${conv.id}`,
            messageId: msg.id,
        });
        byRecipient.set(recipient.id, bucket);
    }

    // Send + stamp in parallel. We stamp on the same set of message ids
    // we just included in each email, so the next run skips them.
    let emailed = 0;
    const includedIds: string[] = [];
    for (const { email, items } of byRecipient.values()) {
        try {
            await sendUnreadMessagesReminderEmail(email, items);
            emailed += 1;
            includedIds.push(...items.map((i) => i.messageId));
        } catch (err) {
            console.error(
                "[remind-unread-messages] email failed for",
                email,
                err,
            );
            // Don't stamp — try again next run.
        }
    }

    if (includedIds.length > 0) {
        await prisma.conversationMessage.updateMany({
            where: { id: { in: includedIds } },
            data: { reminder_sent_at: new Date() },
        });
    }

    return NextResponse.json({
        scanned: aged.length,
        recipients: byRecipient.size,
        emailed,
        stamped: includedIds.length,
    });
}
