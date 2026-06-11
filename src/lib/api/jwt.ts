import { jwtVerify, SignJWT } from "jose";

/**
 * Access-token signing for the mobile client. Web continues to use NextAuth's
 * cookie-bound JWT — these tokens are issued only by /api/v1/auth/* and only
 * accepted by Bearer-auth-gated routes. They never enter the cookie path, so
 * NextAuth doesn't need to understand them.
 *
 * Signing key: AUTH_SECRET (same secret NextAuth already uses). Reusing it
 * keeps the env surface small. Algorithm is HS256.
 */

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;        // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;  // 30 days

export interface AccessTokenClaims {
    sub: string;          // user id
    isAdmin: boolean;
    sellerEnabled: boolean;
}

function getSecretKey(): Uint8Array {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET is not configured");
    }
    return new TextEncoder().encode(secret);
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return await new SignJWT({
        isAdmin: claims.isAdmin,
        sellerEnabled: claims.sellerEnabled,
    })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(claims.sub)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
        .setIssuer("modaire-mobile")
        .sign(getSecretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    try {
        const { payload } = await jwtVerify(token, getSecretKey(), {
            issuer: "modaire-mobile",
        });
        const sub = typeof payload.sub === "string" ? payload.sub : null;
        if (!sub) return null;
        return {
            sub,
            isAdmin: payload.isAdmin === true,
            sellerEnabled: payload.sellerEnabled === true,
        };
    } catch {
        return null;
    }
}
