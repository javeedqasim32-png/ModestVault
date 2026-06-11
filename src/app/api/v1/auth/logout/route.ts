import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/validate";
import { revokeRefreshToken } from "@/lib/api/refresh-token";

export const dynamic = "force-dynamic";

const LogoutBody = z.object({
    refreshToken: z.string().min(1),
});

/**
 * POST /api/v1/auth/logout
 *
 * Idempotent — revokes the presented refresh token if it exists and isn't
 * already revoked. Always returns 204; we don't leak whether the token was
 * valid. The client should also drop its in-memory + secure-storage copies.
 */
export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, LogoutBody);
    if (parsed instanceof NextResponse) return parsed;
    await revokeRefreshToken(parsed.refreshToken);
    return new NextResponse(null, { status: 204 });
}
