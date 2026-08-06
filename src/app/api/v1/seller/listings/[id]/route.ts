import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { serializeSellerListingDetailForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/seller/listings/[id]
 *
 * Full editable view of one listing the caller owns. 404 (not 403) for
 * not-yours so we don't reveal whether the id exists.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                select: {
                    id: true,
                    imageUrl: true,
                    thumbUrl: true,
                    mediumUrl: true,
                    imageOrder: true,
                },
            },
        },
    });
    if (!listing || listing.user_id !== principal.id) {
        return apiError("NOT_FOUND", "Listing not found.");
    }

    return NextResponse.json({
        listing: serializeSellerListingDetailForMobile(
            listing as unknown as Parameters<typeof serializeSellerListingDetailForMobile>[0],
        ),
    });
}

const UpdateBody = z.object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().min(1).max(5000).optional(),
    price: z.coerce.number().positive().optional(),
    style: z.string().min(1).max(80).optional(),
    category: z.string().min(1).max(80).optional(),
    subcategory: z.string().max(80).nullable().optional(),
    type: z.string().max(80).nullable().optional(),
    condition: z.string().max(40).nullable().optional(),
    brand: z.string().max(80).nullable().optional(),
    size: z.string().max(20).nullable().optional(),
});

/**
 * DELETE /api/v1/seller/listings/[id]
 *
 * Removes the seller's own listing. 404 if not theirs so we don't leak
 * existence. Cascading deletes (purchases/cart/favorites) follow the
 * model's onDelete rules from the Prisma schema.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const existing = await prisma.listing.findUnique({
        where: { id },
        select: { user_id: true, status: true },
    });
    if (!existing || existing.user_id !== principal.id) {
        return apiError("NOT_FOUND", "Listing not found.");
    }
    if (existing.status === "SOLD") {
        return apiError(
            "INVALID_INPUT",
            "Sold listings can't be deleted — they're part of an order.",
        );
    }
    await prisma.listing.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
}

/**
 * PUT /api/v1/seller/listings/[id]
 *
 * Updates an existing listing's metadata. Photos aren't editable from
 * this endpoint — separate photo-management endpoints come with the
 * full edit-photo flow. Resets moderation_status to PENDING so admin
 * review re-runs on the new content (same behavior as the web's
 * updateListing server action).
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const existing = await prisma.listing.findUnique({
        where: { id },
        select: { user_id: true },
    });
    if (!existing || existing.user_id !== principal.id) {
        return apiError("NOT_FOUND", "Listing not found.");
    }

    const parsed = await parseJsonBody(req, UpdateBody);
    if (parsed instanceof NextResponse) return parsed;

    await prisma.listing.update({
        where: { id },
        data: {
            ...parsed,
            moderation_status: "PENDING",
        },
    });

    return NextResponse.json({ ok: true });
}
