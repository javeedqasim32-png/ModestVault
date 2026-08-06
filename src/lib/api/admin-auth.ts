import { NextRequest } from "next/server";
import { apiError } from "./errors";
import { requireBearer, type Principal } from "./bearer-auth";

/**
 * Admin gate for /api/v1/admin/** routes. Returns either the principal
 * or a NextResponse the route can return directly. Single helper so
 * every admin endpoint enforces the same UNAUTHORIZED / FORBIDDEN
 * shape and never accidentally trusts a missing isAdmin flag.
 *
 *   const auth = await requireAdmin(req);
 *   if (auth instanceof NextResponse) return auth;
 *   const principal = auth;
 */
export async function requireAdmin(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");
    if (!principal.isAdmin) return apiError("FORBIDDEN", "Admin only.");
    return principal as Principal;
}
