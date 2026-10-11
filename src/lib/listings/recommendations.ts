import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Listing-page recommendations: a single "Similar items" section. Returns the
 * exact fields FeaturedListingTile needs. Only publicly visible listings are ever
 * recommended (available + approved), matching what the seller profile and
 * browse pages show.
 */

const CARD_SELECT = {
    id: true,
    title: true,
    price: true,
    category: true,
    subcategory: true,
    style: true,
    size: true,
    user_id: true,
    image_url: true,
    status: true,
    created_at: true,
    images: {
        orderBy: { imageOrder: "asc" as const },
        take: 1,
        select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
    },
} satisfies Prisma.ListingSelect;

const VISIBLE = {
    status: "AVAILABLE",
    moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
} satisfies Prisma.ListingWhereInput;

export type RecommendedListing = Prisma.ListingGetPayload<{ select: typeof CARD_SELECT }>;

/**
 * Similar items from any seller (this seller's other items included — one
 * section, no duplicate rails). Candidate pool is the same category; ranked by
 * subcategory match, then style match, then closest price. No ML needed for
 * this to feel right.
 */
export async function getSimilarListings(
    listing: {
        id: string;
        category: string;
        subcategory: string | null;
        style: string;
        price: Prisma.Decimal | number;
    },
    take = 8,
): Promise<RecommendedListing[]> {
    const price = Number(listing.price);
    const pool = await prisma.listing.findMany({
        where: {
            ...VISIBLE,
            category: listing.category,
            id: { not: listing.id },
        },
        orderBy: { created_at: "desc" },
        take: 40,
        select: CARD_SELECT,
    });

    return pool
        .map((l) => ({
            l,
            score: (l.subcategory === listing.subcategory ? 2 : 0) + (l.style === listing.style ? 1 : 0),
            diff: Math.abs(Number(l.price) - price),
        }))
        .sort((a, b) => b.score - a.score || a.diff - b.diff)
        .slice(0, take)
        .map((x) => x.l);
}

/** Thumbnail-first image for a recommendation tile, mirroring getPrimaryListingImage's "thumb" pick. */
export function recommendationImage(l: RecommendedListing): string {
    const img = l.images[0];
    return img?.thumbUrl ?? img?.mediumUrl ?? img?.imageUrl ?? l.image_url ?? "";
}
