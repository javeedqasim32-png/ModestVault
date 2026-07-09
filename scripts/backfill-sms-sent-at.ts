/**
 * Modaire — one-off backfill for existing ConversationMessage rows so
 * the message-SMS piggyback in send-new-message-emails doesn't
 * retroactively text users about conversations they were already
 * notified about (or already read) before SMS existed.
 *
 * Without this, when the cron first runs after the SMS work deploys, it
 * would look back at every unread message older than 5 min — potentially
 * thousands of messages from before SMS launched — and blast users with
 * "You have N new messages" SMS about ancient conversations.
 *
 * This stamps `sms_sent_at = NOW()` on every existing ConversationMessage
 * where SMS would be a duplicate notification (already-emailed OR
 * already-read). Only truly-new, still-unread messages that arrive AFTER
 * this backfill runs will trigger SMS.
 *
 * Purchases don't need backfill — sale-SMS is fired directly from
 * checkout-finalize.ts (no cron looks at historical rows).
 *
 * Idempotent: rows already stamped are skipped by the WHERE clause.
 *
 * Usage:
 *   npx tsx scripts/backfill-sms-sent-at.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
}
const adapter = new PrismaPg({ connectionString } as any);
const prisma = new PrismaClient({ adapter });

async function run() {
    console.log("=== ConversationMessage.sms_sent_at backfill ===");
    const now = new Date();

    // Anything that's already been emailed-about or already read is not
    // something we want an SMS to fire for retroactively.
    const messagesResult = await prisma.conversationMessage.updateMany({
        where: {
            sms_sent_at: null,
            OR: [
                { email_sent_at: { not: null } },
                { read_at: { not: null } },
            ],
        },
        data: { sms_sent_at: now },
    });
    console.log(
        `  Stamped ${messagesResult.count} message(s) (already-emailed or already-read).`,
    );

    console.log("");
    console.log("Done. Only truly-new, still-unread messages will trigger SMS from now on.");

    await prisma.$disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
