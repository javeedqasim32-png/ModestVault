import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNewMessageEmail } from "@/lib/email";
import { sendNewMessagesSMS } from "@/lib/sms";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * Cron-driven delayed "you got a message" notification. Runs every minute
 * (recommended). For each conversation message that:
 *
 *   - is older than DELAY_MINUTES (default 5)
 *   - has NOT been read yet (read_at IS NULL)
 *   - has NOT already had its email OR SMS sent
 *
 * dispatches:
 *
 *   1. **Email** — one per message (mirrors website chat bubble). Stamps
 *      `email_sent_at` per message.
 *   2. **SMS** — one per recipient covering the whole 5-min batch. If a
 *      user got 3 messages from 2 senders they get 1 SMS ("You have 3
 *      new messages"), not 3 SMS. Stamps `sms_sent_at` on every included
 *      message so the next cron run skips them.
 *
 * The 5-minute delay is the whole point: when two users are actively
 * chatting, each message gets read within seconds, so this cron skips
 * it. Notifications only fire when the recipient genuinely hasn't been
 * online to see the message.
 *
 * Separate from the 24h digest at /api/internal/remind-unread-messages —
 * that path fires 24h later for any message still unread; both can fire
 * for the same conversation.
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

    // OR gate: pick up any message that still needs SOMETHING sent — email
    // OR sms. In steady-state both get stamped together, but if SMS
    // failed on a previous pass (Twilio outage) the row will show up
    // again next minute without re-emailing.
    const messages = await prisma.conversationMessage.findMany({
        where: {
            read_at: null,
            OR: [{ email_sent_at: null }, { sms_sent_at: null }],
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
                    buyer: {
                        select: {
                            id: true,
                            email: true,
                            phone: true,
                            sms_opt_in: true,
                            is_admin: true,
                        },
                    },
                    seller: {
                        select: {
                            id: true,
                            email: true,
                            phone: true,
                            sms_opt_in: true,
                            is_admin: true,
                        },
                    },
                },
            },
        },
    });

    if (messages.length === 0) {
        return NextResponse.json({ scanned: 0, emailed: 0, sms: 0 });
    }

    const appUrl = await getAppUrl();

    // ---------- Pass 1: Email (per-message) ---------- //

    let emailed = 0;
    const emailStampIds: string[] = [];
    for (const msg of messages) {
        if (msg.email_sent_at) continue;

        const conv = msg.conversation;
        const isFromBuyer = msg.sender_id === conv.buyer_id;
        const recipient = isFromBuyer ? conv.seller : conv.buyer;

        if (!recipient?.email || recipient.is_admin) {
            // Nothing to email — stamp so we don't reprocess.
            emailStampIds.push(msg.id);
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
            emailStampIds.push(msg.id);
        } catch (err) {
            console.error(
                "[send-new-message-emails] email failed for",
                recipient.email,
                err,
            );
        }
    }

    if (emailStampIds.length > 0) {
        await prisma.conversationMessage.updateMany({
            where: { id: { in: emailStampIds } },
            data: { email_sent_at: new Date() },
        });
    }

    // ---------- Pass 2: SMS (batched per recipient) ---------- //

    // Group messages by recipient user id. Only messages that don't yet
    // have sms_sent_at count toward the batch.
    type BatchEntry = {
        recipient: {
            id: string;
            phone: string | null;
            sms_opt_in: boolean;
        };
        messageIds: string[];
        firstSenderName: string;
    };
    const smsBatches = new Map<string, BatchEntry>();
    for (const msg of messages) {
        if (msg.sms_sent_at) continue;

        const conv = msg.conversation;
        const isFromBuyer = msg.sender_id === conv.buyer_id;
        const recipient = isFromBuyer ? conv.seller : conv.buyer;
        if (!recipient || recipient.is_admin) continue;

        const senderName =
            [msg.sender?.first_name, msg.sender?.last_name]
                .filter((s): s is string => !!s && s.trim().length > 0)
                .join(" ")
                .trim() || "Someone";

        const existing = smsBatches.get(recipient.id);
        if (existing) {
            existing.messageIds.push(msg.id);
        } else {
            smsBatches.set(recipient.id, {
                recipient: {
                    id: recipient.id,
                    phone: recipient.phone,
                    sms_opt_in: recipient.sms_opt_in,
                },
                messageIds: [msg.id],
                firstSenderName: senderName,
            });
        }
    }

    let smsSent = 0;
    const smsStampIds: string[] = [];
    for (const batch of smsBatches.values()) {
        // Always stamp so we don't re-process next minute — even skips
        // (no phone, opted out) count as "done from cron's perspective."
        smsStampIds.push(...batch.messageIds);

        const result = await sendNewMessagesSMS(
            batch.recipient.phone,
            batch.messageIds.length,
            batch.firstSenderName,
            { optedOut: !batch.recipient.sms_opt_in },
        );
        if (result.ok) smsSent += 1;
    }

    if (smsStampIds.length > 0) {
        await prisma.conversationMessage.updateMany({
            where: { id: { in: smsStampIds } },
            data: { sms_sent_at: new Date() },
        });
    }

    return NextResponse.json({
        scanned: messages.length,
        emailed,
        emailStamped: emailStampIds.length,
        sms: smsSent,
        smsStamped: smsStampIds.length,
    });
}
