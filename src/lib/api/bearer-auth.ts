import { NextRequest } from "next/server";
import { verifyAccessToken, type AccessTokenClaims } from "./jwt";

/**
 * The authenticated principal extracted from a Bearer token. Mirrors the
 * NextAuth session shape used by web (`{id, isAdmin, sellerEnabled}`) so
 * downstream code can be written once and called from either path.
 */
export interface Principal {
    id: string;
    isAdmin: boolean;
    sellerEnabled: boolean;
}

/**
 * Parse and verify the Bearer token on a /api/v1/* request. Returns the
 * principal or null if absent/invalid. The route handler is responsible for
 * returning 401 via `apiError("UNAUTHORIZED", ...)` when null.
 *
 *   const principal = await requireBearer(req);
 *   if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");
 */
export async function requireBearer(req: NextRequest): Promise<Principal | null> {
    const header = req.headers.get("authorization");
    if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
    const token = header.slice("bearer ".length).trim();
    if (!token) return null;
    const claims = await verifyAccessToken(token);
    if (!claims) return null;
    return claimsToPrincipal(claims);
}

function claimsToPrincipal(c: AccessTokenClaims): Principal {
    return { id: c.sub, isAdmin: c.isAdmin, sellerEnabled: c.sellerEnabled };
}
