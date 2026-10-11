import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { getSimilarListings } from "@/lib/listings/recommendations";
import { serializeListingSummaryForMobile } from "@/lib/api/mobile-serializers";
import { getEffectivePricesForListings } from "@/lib/promotions/get-effective-price";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/listings/[id]/related   (public)
 *
 * { similar: ListingSummary[] } — the same "Similar items" ranking as the
 * website (src/lib/listings/recommendations),
 * serialized with the standard mobile summary shape and promo-aware prices so
 * the app's ListingTile parses it unchanged and tile prices can't drift from
 * checkout.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id },
        select: { id: true, category: true, subcategory: true, style: true, price: true },
    });
    if (!listing) return apiError("NOT_FOUND", "Listing not found.");

    const similar = await getSimilarListings(listing, 8);
    const ids = similar.map((l) => l.id);
    if (ids.length === 0) return NextResponse.json({ similar: [] });

    // Re-fetch the full shape the mobile serializer expects (all scalars +
    // ordered images); the ranking from the recs lib is preserved below.
    const full = await prisma.listing.findMany({
        where: { id: { in: ids } },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                select: { id: true, imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
        },
    });
    const byId = new Map(full.map((l) => [l.id, l]));
    const prices = await getEffectivePricesForListings(full);
    const out = similar
        .map((r) => byId.get(r.id))
        .filter((l): l is NonNullable<typeof l> => !!l)
        .map((l) => serializeListingSummaryForMobile(l, { effectivePrice: prices.get(l.id) ?? null }));

    return NextResponse.json({ similar: out });
}
