import { NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { normalizeUsPhoneInput } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * Twilio inbound-SMS webhook. Called by Twilio whenever someone texts our
 * TWILIO_FROM_NUMBER. We use it exclusively to mirror opt-out state into
 * our DB — Twilio auto-blocks STOP replies at their platform layer
 * regardless, but the DB mirror lets our own send-sites short-circuit
 * before we even hit Twilio.
 *
 * Verification: Twilio signs every request with X-Twilio-Signature; we
 * use their SDK's validator with our Auth Token. Anything without a
 * valid signature gets 403 — protects us from spoofed opt-outs that
 * could DoS legitimate users' SMS.
 */

const OPT_OUT_KEYWORDS = new Set([
    "STOP",
    "UNSUBSCRIBE",
    "CANCEL",
    "END",
    "QUIT",
    "STOPALL",
    "REVOKE",
    "OPTOUT",
]);

function absoluteUrl(request: Request): string {
    // Twilio's signature is calculated over the full canonical URL. We
    // must reconstruct exactly what they signed, including x-forwarded
    // headers behind our EC2 → nginx path.
    const url = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedProto) url.protocol = `${forwardedProto}:`;
    if (forwardedHost) url.host = forwardedHost;
    return url.toString();
}

export async function POST(request: Request) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
        console.error("[sms/inbound] TWILIO_AUTH_TOKEN not set — rejecting");
        return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    // Twilio POSTs form-urlencoded.
    const rawBody = await request.text();
    const params: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(rawBody).entries()) {
        params[key] = value;
    }

    const signature = request.headers.get("x-twilio-signature") ?? "";
    const url = absoluteUrl(request);
    const valid = twilio.validateRequest(authToken, signature, url, params);
    if (!valid) {
        console.warn(
            `[sms/inbound] Invalid X-Twilio-Signature for ${url} — rejecting`,
        );
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const from = params.From ?? "";
    const body = (params.Body ?? "").trim().toUpperCase();

    if (!from || !body) return NextResponse.json({ ok: true });
    if (!OPT_OUT_KEYWORDS.has(body)) {
        // Not an opt-out — someone replied conversationally. Log and drop;
        // Twilio does not require any TwiML response for us to be compliant.
        console.log(`[sms/inbound] Non-optout reply from ${from}: ${body}`);
        return NextResponse.json({ ok: true });
    }

    // Twilio sends E.164 (`+14155551234`). Strip to bare digits so we can
    // match against however User.phone was stored. Try a few common shapes.
    const digits = normalizeUsPhoneInput(from);
    const candidates = new Set<string>();
    if (digits) {
        candidates.add(digits);
        if (digits.startsWith("1")) candidates.add(digits.slice(1));
    }
    candidates.add(from);
    if (from.startsWith("+")) candidates.add(from.slice(1));

    const updated = await prisma.user.updateMany({
        where: { phone: { in: Array.from(candidates) } },
        data: { sms_opt_in: false },
    });
    console.log(
        `[sms/inbound] STOP from ${from} → flipped sms_opt_in=false on ${updated.count} user row(s)`,
    );

    return NextResponse.json({ ok: true, updated: updated.count });
}
