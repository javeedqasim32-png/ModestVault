/**
 * One-off SMS diagnostic sender. Invokes the same sendSms() that the
 * production 5-min unread-message cron uses, so a successful send here
 * proves the whole path (env vars → E.164 normalize → Twilio → opt-out
 * gate) is healthy end-to-end.
 *
 * Usage:
 *   npx tsx --tsconfig ./tsconfig.json scripts/test-sms.ts +18172627618
 *   npx tsx --tsconfig ./tsconfig.json scripts/test-sms.ts +18172627618 "custom body"
 *
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env.
 * Run on EC2 for a true prod-parity test; local runs work if your .env
 * mirrors the prod Twilio credentials.
 *
 * See plan file (~/.claude/plans/) for the interpretation matrix — what
 * "ok: true but phone doesn't ring" means vs. "ok: false with OPTED_OUT" etc.
 */

import "dotenv/config";
import { sendSms } from "../src/lib/sms";

async function main() {
    const to = process.argv[2] ?? "+18172627618";
    const body = process.argv[3] ?? "Modaire test: reply if received. STOP to opt out.";

    console.log("Attempting send:");
    console.log("  to:  ", to);
    console.log("  body:", body, `(${body.length} chars)`);
    console.log("  env: ", {
        accountSid: process.env.TWILIO_ACCOUNT_SID
            ? `${process.env.TWILIO_ACCOUNT_SID.slice(0, 8)}…`
            : "MISSING",
        from: process.env.TWILIO_FROM_NUMBER ?? "MISSING",
    });

    const started = Date.now();
    const result = await sendSms(to, body);
    const elapsed = Date.now() - started;

    console.log(`\nResult after ${elapsed}ms:`);
    console.log(JSON.stringify(result, null, 2));

    if (result.ok) {
        console.log("\n✓ Twilio accepted the send. Check delivery status:");
        console.log("  1. Twilio Console → Monitor → Logs → Messages");
        console.log(`  2. Check ${to} for arrival (may take seconds to minutes)`);
        console.log("  3. If Twilio shows 'delivered' but no SMS arrives, the carrier");
        console.log("     silently dropped it (opt-out, block, or handset issue).");
    } else {
        console.log(`\n✗ Send failed with error: ${result.error}`);
        if (result.error === "OPTED_OUT") {
            console.log("  → Recipient previously opted out. They must text START to re-subscribe.");
        } else if (result.error === "INVALID_PHONE") {
            console.log("  → Number didn't pass E.164 normalization. Check the input format.");
        } else if (result.error === "TWILIO_NOT_CONFIGURED") {
            console.log("  → Env vars missing. Check TWILIO_ACCOUNT_SID/TOKEN/FROM_NUMBER.");
        } else if (result.error.startsWith("TWILIO_ERROR:")) {
            const code = result.error.split(":")[1];
            console.log(`  → Twilio returned error code ${code}. See https://www.twilio.com/docs/api/errors/${code}`);
        }
    }
}

main().catch((err) => {
    console.error("Uncaught error:", err);
    process.exit(1);
});
