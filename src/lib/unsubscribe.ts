import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stateless HMAC-signed unsubscribe tokens.
 *
 * Payload layout: base64url(`v1.{userId}.{expiresAtSec}`) + "." +
 * base64url(HMAC-SHA256(AUTH_SECRET, `v1.{userId}.{expiresAtSec}`))
 *
 * Chosen over a DB-backed token so:
 *   - There are no rows to prune when marketing broadcasts expire.
 *   - The unsubscribe link inside a sent email keeps working forever
 *     (up to the `expiresAtSec` we sign in — set generously, 2 years).
 *   - No round-trip to the DB on the click — worst case is a malformed
 *     token gets a 404 immediately.
 *
 * `AUTH_SECRET` is reused as the HMAC key. If rotated, older
 * unsubscribe links stop working — a fair tradeoff for zero state.
 */

const VERSION = "v1";
const DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years

function getSecret(): string {
    const s = process.env.AUTH_SECRET;
    if (!s) throw new Error("AUTH_SECRET is required for unsubscribe token signing");
    return s;
}

function b64urlEncode(input: string): string {
    return Buffer.from(input, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function b64urlDecode(input: string): string {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return Buffer.from(padded + pad, "base64").toString("utf8");
}

function sign(payload: string): string {
    const mac = createHmac("sha256", getSecret()).update(payload).digest();
    return mac.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateUnsubscribeToken(
    userId: string,
    expiresInSeconds: number = DEFAULT_EXPIRY_SECONDS,
): string {
    const expiresAtSec = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${VERSION}.${userId}.${expiresAtSec}`;
    const encoded = b64urlEncode(payload);
    const sig = sign(payload);
    return `${encoded}.${sig}`;
}

export type UnsubscribeTokenPayload = {
    userId: string;
    expiresAtSec: number;
};

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
    if (!token || typeof token !== "string") return null;
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    let payload: string;
    try {
        payload = b64urlDecode(encoded);
    } catch {
        return null;
    }
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parts = payload.split(".");
    if (parts.length !== 3 || parts[0] !== VERSION) return null;
    const [, userId, expStr] = parts;
    const expiresAtSec = Number(expStr);
    if (!Number.isFinite(expiresAtSec)) return null;
    if (Math.floor(Date.now() / 1000) > expiresAtSec) return null;
    if (!userId) return null;
    return { userId, expiresAtSec };
}

/**
 * Build the absolute URL an email footer would link to. Uses
 * NEXT_PUBLIC_APP_URL so dev vs prod domains just work.
 */
export function buildUnsubscribeUrl(userId: string): string {
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://shopmodaire.com").replace(/\/$/, "");
    return `${base}/unsubscribe/${generateUnsubscribeToken(userId)}`;
}
