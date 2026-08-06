import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/api/admin-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { sendListingApprovedEmail } from "@/lib/email";
import { createNotification } from "@/app/actions/notifications";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/listings/[id]/approve
 *
 * Body: `{ feature?: boolean }` — when true, also flips is_featured on
 * (matches approveAndFeatureListing in src/app/actions/admin.ts). Both
 * variants send the same APPROVED notification + email.
 */
const schema = z.object({ feature: z.boolean().optional() });

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const principal = auth;

    const parsed = await parseJsonBody(req, schema).catch(() => ({} as { feature?: boolean }));
    const body = parsed instanceof NextResponse ? {} : parsed;

    const { id } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!listing) return apiError("NOT_FOUND", "Listing not found.");

    const updated = await prisma.listing.update({
        where: { id },
        data: {
            moderation_status: "APPROVED",
            status: "AVAILABLE",
            is_featured: body.feature === true ? true : undefined,
            reviewed_at: new Date(),
            reviewed_by_id: principal.id,
            rejection_reason: null,
        },
        select: {
            id: true,
            title: true,
            user: { select: { id: true, email: true } },
        },
    });

    if (updated.user?.email) {
        void sendListingApprovedEmail(updated.user.email, updated.title);
    }
    await createNotification({
        userId: updated.user.id,
        type: "LISTING_APPROVED",
        title: `Listing approved: ${updated.title}`,
        body: "Your listing is now live on the marketplace.",
        linkUrl: `/listings/${updated.id}`,
    });

    return NextResponse.json({ success: true, featured: body.feature === true });
}
