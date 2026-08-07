import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { serializeListingDetailForMobile } from "@/lib/api/mobile-serializers";
import { getEffectivePriceForListing } from "@/lib/promotions/get-effective-price";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/listings/[id]
 *
 * Public detail page. Returns the full listing including gallery + seller
 * card. Sold and partially-approved items are returned (the UI shows a
 * SOLD badge on detail); pending/rejected items are 404'd so buyers can't
 * see things the moderator hasn't approved yet.
 *
 * View-count is incremented best-effort — a failed write doesn't fail the
 * page render. The increment also happens on the website's [id]/page.tsx,
 * so the column reflects total reach across both surfaces.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
        },
    });
    if (!listing) {
        return apiError("NOT_FOUND", "Listing not found.");
    }
    if (
        listing.moderation_status !== "APPROVED" &&
        listing.moderation_status !== "PARTIAL_APPROVED"
    ) {
        return apiError("NOT_FOUND", "Listing not found.");
    }

    const seller = await prisma.user.findUnique({
        where: { id: listing.user_id },
        select: {
            id: true,
            first_name: true,
            last_name: true,
            profile_image: true,
        },
    });

    // Best-effort view-count bump. Failure here is invisible to the client.
    prisma.listing
        .update({ where: { id }, data: { view_count: { increment: 1 } } })
        .catch(() => {});

    const effectivePrice = await getEffectivePriceForListing(listing.id);

    return NextResponse.json({
        listing: serializeListingDetailForMobile(listing, seller, {
            effectivePrice,
        }),
    });
}
