import { timingSafeEqual } from "node:crypto";

/**
 * Shared auth for /api/internal/* cron routes: the `x-cron-secret` header
 * must equal INTERNAL_CRON_SECRET. Fails closed when the secret is unset, and
 * compares in constant time so the secret can't be recovered byte-by-byte
 * from response timing.
 */
export function isCronAuthorized(request: Request): boolean {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    const provided = request.headers.get("x-cron-secret");
    if (!provided) return false;
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}
