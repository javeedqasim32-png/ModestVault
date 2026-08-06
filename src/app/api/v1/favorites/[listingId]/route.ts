import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * PUT  /api/v1/favorites/[listingId]   → add to favorites (idempotent)
 * DELETE /api/v1/favorites/[listingId] → remove from favorites
 *
 * Mirrors the website's setFavoriteForListing server action — same
 * guards (no favoriting your own listing, listing must exist), same
 * upsert semantics so concurrent PUTs are safe.
 */
async function loadOwnedListing(
    listingId: string,
    principalId: string,
): Promise<{ ok: true } | { error: NextResponse }> {
    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true, user_id: true },
    });
    if (!listing) {
        return { error: apiError("NOT_FOUND", "Listing not found.") };
    }
    if (listing.user_id === principalId) {
        return {
            error: apiError(
                "INVALID_INPUT",
                "You cannot favorite your own listing.",
            ),
        };
    }
    return { ok: true };
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ listingId: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { listingId } = await params;
    const check = await loadOwnedListing(listingId, principal.id);
    if ("error" in check) return check.error;

    await prisma.favoriteItem.upsert({
        where: {
            user_id_listing_id: {
                user_id: principal.id,
                listing_id: listingId,
            },
        },
        update: {},
        create: {
            user_id: principal.id,
            listing_id: listingId,
        },
    });

    return NextResponse.json({ isFavorited: true });
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ listingId: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { listingId } = await params;
    await prisma.favoriteItem.deleteMany({
        where: { user_id: principal.id, listing_id: listingId },
    });

    return NextResponse.json({ isFavorited: false });
}
