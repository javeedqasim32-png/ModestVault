import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/api/admin-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { sendListingRejectedEmail } from "@/lib/email";
import { createNotification } from "@/app/actions/notifications";
import { getListingRejectionMessage } from "@/lib/listing-rejection-reasons";

export const dynamic = "force-dynamic";

const schema = z.object({
    reason: z.string().trim().max(500).optional(),
});

/**
 * POST /api/v1/admin/listings/[id]/reject
 *
 * Body: `{ reason?: string }`. Mirrors rejectListing — sets
 * moderation_status = REJECTED, stores the reason, sends the rejection
 * email only when a reason was provided, and posts a LISTING_REJECTED
 * notification.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const principal = auth;

    const parsed = await parseJsonBody(req, schema).catch(
        () => ({} as { reason?: string }),
    );
    const body = parsed instanceof NextResponse ? {} : parsed;
    const reason = body.reason?.trim() || null;

    const { id } = await params;
    const exists = await prisma.listing.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!exists) return apiError("NOT_FOUND", "Listing not found.");

    const updated = await prisma.listing.update({
        where: { id },
        data: {
            moderation_status: "REJECTED",
            reviewed_at: new Date(),
            reviewed_by_id: principal.id,
            rejection_reason: reason,
        },
        select: {
            id: true,
            title: true,
            user: { select: { id: true, email: true } },
        },
    });

    // `reason` is either a preset KEY from the admin dropdown, an "Other"
    // custom text, or legacy free-text. Resolve to the seller-facing message
    // before it goes into the email + notification body.
    const humanReason = getListingRejectionMessage(reason);
    if (updated.user?.email && humanReason) {
        void sendListingRejectedEmail(updated.user.email, updated.title, humanReason);
    }
    await createNotification({
        userId: updated.user.id,
        type: "LISTING_REJECTED",
        title: `Listing rejected: ${updated.title}`,
        body: humanReason ? `Reason: ${humanReason}` : "Edit the listing and resubmit for review.",
        linkUrl: "/sell",
    });

    return NextResponse.json({ success: true });
}
