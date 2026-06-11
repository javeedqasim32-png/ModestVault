import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/devices/[token]
 *
 * Called by the Flutter app on logout (and on the FCM `onTokenRefresh` path
 * for the old token before re-registering the new one). Soft-revokes the
 * token — sets revoked_at so the dispatcher skips it on the next sweep.
 *
 * Owner-only: the token must belong to the calling user. We return 204 on
 * the success path AND on "not yours / not found" to avoid leaking which
 * tokens exist.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { token } = await params;
    if (!token) return apiError("INVALID_INPUT", "Token is required.");

    await (prisma as any).deviceToken.updateMany({
        where: { token, user_id: principal.id, revoked_at: null },
        data: { revoked_at: new Date() },
    });
    return new NextResponse(null, { status: 204 });
}
