import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { REFRESH_TOKEN_TTL_SECONDS } from "./jwt";

/**
 * Refresh-token plumbing for the mobile auth flow.
 *
 * Token format on the wire: 256-bit random hex string (64 chars). Opaque to
 * the client. On the server we store only sha256(token) so a stolen DB row
 * can't be replayed. The token itself is shown to the client exactly once,
 * at issuance — neither stored nor re-derivable.
 *
 * Rotation: every successful /auth/refresh revokes the presented row and
 * inserts a new one (revoked_at on old, fresh row with same user_id). If a
 * caller ever presents a token whose row is already revoked, the chain is
 * compromised — we currently just 401 in that case; mass-revocation of the
 * user's other sessions is a v2 hardening.
 */

const TOKEN_BYTES = 32;

function makeRandomToken(): string {
    return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export interface IssuedRefreshToken {
    /** Opaque token to return to the client. */
    token: string;
    /** Row id, in case the caller needs to reference it. */
    id: string;
    /** Absolute expiry. Reported to client so it can refresh proactively. */
    expiresAt: Date;
}

export async function issueRefreshToken(
    userId: string,
    deviceId: string | null,
): Promise<IssuedRefreshToken> {
    const token = makeRandomToken();
    const tokenHash = hashRefreshToken(token);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    const row = await (prisma as any).refreshToken.create({
        data: {
            user_id: userId,
            token_hash: tokenHash,
            device_id: deviceId,
            expires_at: expiresAt,
        },
        select: { id: true },
    });
    return { token, id: row.id, expiresAt };
}

export interface ConsumedRefreshToken {
    userId: string;
    deviceId: string | null;
    rowId: string;
}

/**
 * Look up a presented refresh token and atomically mark it revoked. Returns
 * the originating user (so the caller can issue a new token + access token)
 * or null if the token is unknown, already revoked, or expired.
 *
 * Race-safe: uses updateMany WHERE revoked_at IS NULL so two concurrent
 * refresh calls can't both succeed against the same row.
 */
export async function consumeRefreshToken(token: string): Promise<ConsumedRefreshToken | null> {
    const tokenHash = hashRefreshToken(token);
    const now = new Date();
    // Find the row first so we can return its user_id / device_id; then
    // attempt the revocation in one statement.
    const row = await (prisma as any).refreshToken.findUnique({
        where: { token_hash: tokenHash },
        select: { id: true, user_id: true, device_id: true, revoked_at: true, expires_at: true },
    });
    if (!row) return null;
    if (row.revoked_at) return null;
    if (row.expires_at <= now) return null;

    const result = await (prisma as any).refreshToken.updateMany({
        where: { id: row.id, revoked_at: null },
        data: { revoked_at: now, last_used_at: now },
    });
    if (result.count === 0) return null;

    return { userId: row.user_id, deviceId: row.device_id, rowId: row.id };
}

/** Revoke a single token by its plaintext value. Used by /auth/logout. */
export async function revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = hashRefreshToken(token);
    await (prisma as any).refreshToken.updateMany({
        where: { token_hash: tokenHash, revoked_at: null },
        data: { revoked_at: new Date() },
    });
}

/** Revoke every active refresh token for a user. Used by /auth/delete-account. */
export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await (prisma as any).refreshToken.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
    });
}
