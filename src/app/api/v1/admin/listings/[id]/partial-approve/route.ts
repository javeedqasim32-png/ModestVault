import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/api/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/listings/[id]/partial-approve
 *
 * Sets moderation_status = PARTIAL_APPROVED — the listing shows up on
 * Explore (pushed to the end) but is excluded from Home feeds. No email,
 * no notification, matching partiallyApproveListing.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const principal = auth;

    const { id } = await params;
    const exists = await prisma.listing.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!exists) return apiError("NOT_FOUND", "Listing not found.");

    await prisma.listing.update({
        where: { id },
        data: {
            moderation_status: "PARTIAL_APPROVED",
            status: "AVAILABLE",
            reviewed_at: new Date(),
            reviewed_by_id: principal.id,
            rejection_reason: null,
        },
    });
    return NextResponse.json({ success: true });
}
