import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { revokeAllRefreshTokensForUser } from "@/lib/api/refresh-token";

export const dynamic = "force-dynamic";

const PURGE_GRACE_DAYS = 30;

/**
 * POST /api/v1/auth/delete-account
 *
 * App Store guideline 5.1.1(v) and Google Play account deletion rules require
 * in-app account deletion. This endpoint performs a SOFT delete:
 *
 *   - Sets deleted_at = now() and deletion_scheduled_purge_at = now() + 30 days
 *   - Marks the account as disabled so all auth paths reject it immediately
 *   - Revokes every active refresh token on this user
 *
 * A background purge job (not implemented here) will scrub PII for any row
 * whose deletion_scheduled_purge_at has passed. Soft-delete + grace period
 * gives a buyer the chance to recover their account if they tap the button
 * by accident, and lets us preserve order/refund records that other tables
 * still reference.
 *
 * Auth: Bearer.
 *
 * Response:
 *   204 on success.
 *   401 if no Bearer.
 *   404 if the user no longer exists.
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const now = new Date();
    const purgeAt = new Date(now.getTime() + PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);

    const updated = await prisma.user.updateMany({
        where: { id: principal.id, deleted_at: null },
        data: {
            deleted_at: now,
            deletion_scheduled_purge_at: purgeAt,
            is_disabled: true,
        },
    });
    if (updated.count === 0) {
        // Already deleted, or doesn't exist. Either way the caller's session
        // is gone — return 404 so the client clears local state.
        return apiError("NOT_FOUND", "Account not found.");
    }

    await revokeAllRefreshTokensForUser(principal.id);
    return new NextResponse(null, { status: 204 });
}
