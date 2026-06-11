import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { signAccessToken } from "@/lib/api/jwt";
import { consumeRefreshToken, issueRefreshToken } from "@/lib/api/refresh-token";

export const dynamic = "force-dynamic";

const RefreshBody = z.object({
    refreshToken: z.string().min(1, "Refresh token is required."),
});

/**
 * POST /api/v1/auth/refresh
 *
 * Rotates the refresh token: the presented one is revoked and a new pair
 * (access + refresh) is issued. The client is expected to single-flight
 * refresh calls so two simultaneous 401s don't both try to consume the same
 * refresh token (the second one would 401 here, triggering a login).
 *
 * Re-reads the user from the DB on every refresh so admin / seller-enabled
 * changes propagate to the next access token within at most 15 minutes (the
 * access-token TTL).
 *
 * Response:
 *   200 { accessToken, refreshToken, refreshExpiresAt }
 *   401 UNAUTHORIZED on unknown / revoked / expired tokens.
 */
export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, RefreshBody);
    if (parsed instanceof NextResponse) return parsed;

    const consumed = await consumeRefreshToken(parsed.refreshToken);
    if (!consumed) {
        return apiError("UNAUTHORIZED", "Session expired. Please sign in again.");
    }

    const user = await prisma.user.findUnique({
        where: { id: consumed.userId },
        select: { id: true, is_admin: true, seller_enabled: true, is_disabled: true, deleted_at: true },
    });
    if (!user || user.is_disabled || user.deleted_at) {
        return apiError("UNAUTHORIZED", "Account is no longer active.");
    }

    const accessToken = await signAccessToken({
        sub: user.id,
        isAdmin: user.is_admin,
        sellerEnabled: user.seller_enabled,
    });
    const refresh = await issueRefreshToken(user.id, consumed.deviceId);

    return NextResponse.json({
        accessToken,
        refreshToken: refresh.token,
        refreshExpiresAt: refresh.expiresAt.toISOString(),
    });
}
