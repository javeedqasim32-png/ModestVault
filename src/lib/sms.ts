import twilio, { type Twilio } from "twilio";
import { normalizeUsPhoneInput, hasCarrierPhoneLength } from "@/lib/phone";

/**
 * Twilio client + three sender helpers for Modaire's SMS channel:
 *   - sendPromotionInvitationSMS — one-off campaign invitations
 *   - sendNewMessagesSMS         — batched inbox digest (piggybacks on
 *                                  the 5-min message-email cron)
 *   - sendItemsSoldSMS           — batched seller sale notifications
 *
 * Every helper returns { ok, error? } instead of throwing. Callers persist
 * successes as `sms_sent_at = NOW()` and failures as
 * `sms_failed_reason = error`. Contrast with src/lib/email.ts which
 * swallows errors — for SMS the failure signal is actionable (bad phone,
 * opted out, Twilio outage) so we surface it.
 *
 * All copy is engineered to fit one 160-character segment ($0.0075). We
 * always end with "Reply STOP to opt out" for TCPA compliance.
 */

export type SmsResult = { ok: true } | { ok: false; error: string };

const OPT_OUT_TAIL = "Reply STOP to opt out";

// Lazy singleton — createClient at module import time would crash the
// whole build when env vars are absent (dev without Twilio configured,
// CI, etc). Instead we defer to first send.
let cachedClient: Twilio | null = null;
let cachedClientKey = "";

function getClient(): Twilio | null {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return null;
    const key = `${sid}|${token}`;
    if (cachedClient && cachedClientKey === key) return cachedClient;
    cachedClient = twilio(sid, token);
    cachedClientKey = key;
    return cachedClient;
}

/**
 * Format a US phone value for Twilio. `normalizePhoneForCarrier` from
 * phone.ts stamps a fallback ("5555555555") when the input is unparseable
 * — that's a placeholder for shipping carriers, not something we want to
 * dial. Here we bail with INVALID_PHONE instead.
 */
function toE164(phone: string | null | undefined): string | null {
    if (!phone) return null;
    if (!hasCarrierPhoneLength(phone)) return null;
    const digits = normalizeUsPhoneInput(phone);
    if (digits.length !== 11 || !digits.startsWith("1")) return null;
    return `+${digits}`;
}

/**
 * Low-level dispatch. Handles env-var absence, phone validation, opt-out
 * short-circuit, Twilio errors. Callers add product-specific copy.
 */
export async function sendSms(
    phone: string | null | undefined,
    body: string,
    opts?: { optedOut?: boolean },
): Promise<SmsResult> {
    if (opts?.optedOut) return { ok: false, error: "OPTED_OUT" };

    const client = getClient();
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!client || !from) {
        console.error(
            "[sms] TWILIO_NOT_CONFIGURED — missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER in env",
        );
        return { ok: false, error: "TWILIO_NOT_CONFIGURED" };
    }

    const to = toE164(phone);
    if (!to) return { ok: false, error: "INVALID_PHONE" };

    try {
        await client.messages.create({ from, to, body });
        console.log(`✉️  SMS SENT to ${to} (${body.length} chars)`);
        return { ok: true };
    } catch (err: unknown) {
        const errAny = err as { code?: number | string; message?: string };
        // Twilio errors: https://www.twilio.com/docs/api/errors
        // 21610 = "Message can't be sent to unsubscribed recipient" — the
        // recipient replied STOP earlier and Twilio is enforcing at their
        // layer. Treat as opted-out so callers can flip our DB flag.
        if (errAny?.code === 21610) return { ok: false, error: "OPTED_OUT" };
        const code = errAny?.code ?? "UNKNOWN";
        console.error(`[sms] Twilio error ${code} sending to ${to}:`, errAny?.message);
        return { ok: false, error: `TWILIO_ERROR:${code}` };
    }
}

// ---------- Product helpers ---------- //

/**
 * Promotion campaign invitation. Fired one-off by
 * scripts/create-myrtle-campaign.ts when --send-sms is passed. `shortUrl`
 * is `https://shopmodaire.com/p/{short_slug}` — the /p route redirects to
 * the seller approval page.
 *
 * Sample (149 chars for N=8, X=15, campaign="Summer Sale", short URL):
 *   "Modaire: You have 8 listings eligible for 15% off Summer Sale.
 *    Opt-in by Aug 1: shopmodaire.com/p/aB3xY9zK. Reply STOP to opt out."
 */
export async function sendPromotionInvitationSMS(
    phone: string | null | undefined,
    campaignName: string,
    discountPercent: number,
    listingCount: number,
    shortUrl: string,
    endsAt: Date,
    opts?: { optedOut?: boolean },
): Promise<SmsResult> {
    const listingLabel = listingCount === 1 ? "listing" : "listings";
    const endsLabel = endsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    // Strip protocol from the short URL — Twilio shortens well without
    // https:// and it saves 8 chars.
    const compactUrl = shortUrl.replace(/^https?:\/\//, "");
    const body = `Modaire: You have ${listingCount} ${listingLabel} eligible for ${discountPercent}% off ${campaignName}. Opt-in by ${endsLabel}: ${compactUrl}. ${OPT_OUT_TAIL}`;
    return sendSms(phone, body, opts);
}

/**
 * New-message digest — piggybacks on send-new-message-emails cron.
 * `count` is how many unread messages the recipient has in the current
 * 5-min window. `firstSenderName` is the display name of the first
 * sender (used only in the singular case for a more personal ring).
 */
export async function sendNewMessagesSMS(
    phone: string | null | undefined,
    count: number,
    firstSenderName: string,
    opts?: { optedOut?: boolean },
): Promise<SmsResult> {
    const body = count === 1
        ? `Modaire: ${firstSenderName} sent you a message. shopmodaire.com/messages ${OPT_OUT_TAIL}`
        : `Modaire: You have ${count} new messages. shopmodaire.com/messages ${OPT_OUT_TAIL}`;
    return sendSms(phone, body, opts);
}

/**
 * Item-sold notification. Fired by /api/internal/send-sale-sms cron ~5
 * min after a Purchase is created (batches multiple sales in the window
 * into a single SMS per seller).
 */
export async function sendItemsSoldSMS(
    phone: string | null | undefined,
    count: number,
    firstItemTitle: string,
    firstItemPrice: number,
    opts?: { optedOut?: boolean },
): Promise<SmsResult> {
    const priceLabel = `$${Number.isInteger(firstItemPrice) ? firstItemPrice.toString() : firstItemPrice.toFixed(2)}`;
    const body = count === 1
        ? `Modaire: Your "${firstItemTitle}" sold for ${priceLabel}! Ship soon. shopmodaire.com/dashboard ${OPT_OUT_TAIL}`
        : `Modaire: ${count} of your items just sold! View all: shopmodaire.com/dashboard ${OPT_OUT_TAIL}`;
    return sendSms(phone, body, opts);
}
