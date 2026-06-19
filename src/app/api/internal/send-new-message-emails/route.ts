import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNewMessageEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * Cron-driven delayed "you got a message" email. Runs frequently
 * (recommended every 1-2 minutes). For each conversation message that:
 *
 *   - is older than DELAY_MINUTES (default 5)
 *   - has NOT been read yet (read_at IS NULL)
 *   - has NOT already had its email sent (email_sent_at IS NULL)
 *
 * sends one email per message to the recipient and stamps email_sent_at.
 *
 * The 5-minute delay is the whole point: when two users are actively
 * chatting, each message gets read within seconds, so this cron skips
 * it. Emails only fire when the recipient genuinely hasn't been online
 * to see the message.
 *
 * This is separate from the 24h digest at
 * /api/internal/remind-unread-messages — both can fire for the same
 * message (5 min: "you got a message", 24h: "you have unread messages").
 *
 * Auth: `x-cron-secret` header against INTERNAL_CRON_SECRET.
 */
function isAuthorized(request: Request) {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    const provided = request.headers.get("x-cron-secret");
    return provided === expected;
}

const DELAY_MINUTES = 5;
const MAX_PER_RUN = 200;

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - DELAY_MINUTES * 60 * 1000);

    const messages = await prisma.conversationMessage.findMany({
        where: {
            read_at: null,
            email_sent_at: null,
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

    if (messages.length === 0) {
        return NextResponse.json({ scanned: 0, emailed: 0 });
    }

    const appUrl = await getAppUrl();

    let emailed = 0;
    const sentIds: string[] = [];
    for (const msg of messages) {
        const conv = msg.conversation;
        const isFromBuyer = msg.sender_id === conv.buyer_id;
        const recipient = isFromBuyer ? conv.seller : conv.buyer;

        if (!recipient?.email) {
            sentIds.push(msg.id);
            continue;
        }
        if (recipient.is_admin) {
            sentIds.push(msg.id);
            continue;
        }

        const fromName =
            [msg.sender?.first_name, msg.sender?.last_name]
                .filter((s): s is string => !!s && s.trim().length > 0)
                .join(" ")
                .trim() || "Someone";
        const snippet =
            (msg.body ?? "").trim() ||
            (msg.image_url ? "📷 Sent a photo" : "");

        try {
            await sendNewMessageEmail(
                recipient.email,
                fromName,
                snippet,
                `${appUrl}/messages/${conv.id}`,
            );
            emailed += 1;
            sentIds.push(msg.id);
        } catch (err) {
            console.error(
                "[send-new-message-emails] email failed for",
                recipient.email,
                err,
            );
        }
    }

    if (sentIds.length > 0) {
        await prisma.conversationMessage.updateMany({
            where: { id: { in: sentIds } },
            data: { email_sent_at: new Date() },
        });
    }

    return NextResponse.json({
        scanned: messages.length,
        emailed,
        stamped: sentIds.length,
    });
}
