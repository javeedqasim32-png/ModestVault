import { randomBytes, createHash } from "crypto";

/**
 * Promotion invitation tokens — mirrors the refresh-token pattern:
 *   - Token on the wire: 256-bit random hex (64 chars). Opaque, single-use
 *     as identifier.
 *   - Server stores only sha256(token). A stolen DB row cannot be replayed;
 *     leaking the DB does not leak valid tokens.
 *   - Plaintext is shown exactly once — in the invitation email URL — and
 *     never re-derivable server-side.
 *
 * Lookup happens on token_hash which is @unique on PromotionInvitation, so
 * the comparison is a single indexed DB hit (constant-time from the app's
 * perspective — timing attacks against Postgres index lookups are not a
 * practical threat here).
 */

const TOKEN_BYTES = 32;

export function makeInvitationToken(): string {
    return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashInvitationToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}
