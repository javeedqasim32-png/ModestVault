import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { serializeSellerListingForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/seller/listings
 *
 * Returns every listing owned by the calling user, regardless of
 * moderation/sale state. The client buckets into Active / Pending / Sold
 * tabs from each row's `bucket` field, so we make exactly one DB
 * round-trip for the whole Sell screen.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await prisma.listing.findMany({
        where: { user_id: principal.id },
        orderBy: { created_at: "desc" },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: {
                    imageUrl: true,
                    thumbUrl: true,
                    mediumUrl: true,
                    imageOrder: true,
                },
            },
            purchases: {
                take: 1,
                orderBy: { created_at: "desc" },
                include: { order: { select: { shipping_status: true } } },
            },
        },
    });

    return NextResponse.json({
        listings: rows.map((r) =>
            serializeSellerListingForMobile(
                r as unknown as Parameters<typeof serializeSellerListingForMobile>[0],
            ),
        ),
    });
}
