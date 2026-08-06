import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * PUT  /api/v1/cart/[listingId]   → add to cart (idempotent upsert)
 * DELETE /api/v1/cart/[listingId] → remove from cart
 *
 * Mirrors `addToCartAndRedirect` from src/app/actions/cart.ts — same
 * guards (listing exists + available + not your own). Idempotent so
 * a flaky network can safely retry without ending up with duplicates
 * (the unique constraint on (user_id, listing_id) backs us up).
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ listingId: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { listingId } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true, status: true, user_id: true },
    });
    if (!listing) return apiError("NOT_FOUND", "Listing not found.");
    if (listing.status !== "AVAILABLE") {
        return apiError("CONFLICT", "This item is no longer available.");
    }
    if (listing.user_id === principal.id) {
        return apiError(
            "INVALID_INPUT",
            "You cannot add your own listing to cart.",
        );
    }

    await prisma.cartItem.upsert({
        where: {
            user_id_listing_id: {
                user_id: principal.id,
                listing_id: listingId,
            },
        },
        update: {},
        create: { user_id: principal.id, listing_id: listingId },
    });

    return NextResponse.json({ inCart: true });
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ listingId: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { listingId } = await params;
    await prisma.cartItem.deleteMany({
        where: { user_id: principal.id, listing_id: listingId },
    });

    return NextResponse.json({ inCart: false });
}
