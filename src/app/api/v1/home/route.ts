import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeListingSummaryForMobile } from "@/lib/api/mobile-serializers";
import { getEffectivePricesForListings } from "@/lib/promotions/get-effective-price";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/home
 *
 * Curated rails for the mobile Home tab — categories, editorial hero,
 * Trending Now (top 3 by view count), Featured (admin-curated), and
 * Featured Sellers (top 5 by active listing count).
 *
 * Public — no Bearer required. Recently Viewed lives on a separate
 * endpoint (`POST /api/v1/listings/by-ids`) because the id list comes
 * from the device's local cache.
 */
// File names on disk include a -v2 suffix; the website's home page
// references the un-suffixed names, which 404 — we use the real
// filenames here so mobile actually loads them.
const CATEGORIES = [
    { name: "Western", image: "/category-everyday-blend-v2.png" },
    { name: "Festive Pret", image: "/category-luxury-pret-v2.png" },
    { name: "Formals", image: "/category-formal-wear-v2.png" },
    { name: "Modest Wear", image: "/category-abayas-v2.png" },
    { name: "Bridals", image: "/category-wedding-v2.png" },
];

const TRENDING_LIMIT = 3;
const FEATURED_LIMIT = 8;
const TOP_SELLERS_LIMIT = 5;

const heroUrl = "/hero-timeless-beauty.jpg";

export async function GET() {
    // NOT `as const` — Prisma's ListingWhereInput expects mutable string[]
    // for `moderation_status.in`, and readonly tuples don't structurally
    // fit. Plain object literal is inferred correctly.
    const baseWhere = {
        status: "AVAILABLE",
        moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
    };

    const [trendingRows, featuredRows, topSellerStats] = await Promise.all([
        prisma.listing.findMany({
            where: baseWhere,
            orderBy: [{ view_count: "desc" }, { created_at: "desc" }],
            take: TRENDING_LIMIT,
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
            },
        }),
        prisma.listing.findMany({
            where: { ...baseWhere, is_featured: true },
            orderBy: [
                { featured_order: { sort: "asc", nulls: "last" } },
                { created_at: "desc" },
            ],
            take: FEATURED_LIMIT,
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
            },
        }),
        prisma.listing.groupBy({
            by: ["user_id"],
            where: { status: "AVAILABLE", moderation_status: "APPROVED" },
            _count: { _all: true },
            orderBy: { _count: { user_id: "desc" } },
            take: TOP_SELLERS_LIMIT,
        }),
    ]);

    const topSellerIds = topSellerStats.map((s) => s.user_id);
    const topSellerUsers = topSellerIds.length
        ? await prisma.user.findMany({
              where: { id: { in: topSellerIds } },
              select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  profile_image: true,
              },
          })
        : [];
    // Trending and featured overlap, so resolve both rails in one bulk call
    // and dedupe by id — getEffectivePricesForListings keys off listing id.
    const homePriceMap = await getEffectivePricesForListings(
        [...new Map([...trendingRows, ...featuredRows].map((l) => [l.id, l])).values()].map(
            (l) => ({ id: l.id, price: l.price, status: l.status }),
        ),
    );

    const topSellerById = new Map(topSellerUsers.map((u) => [u.id, u]));
    const featuredSellers = topSellerStats
        .map((stat) => {
            const u = topSellerById.get(stat.user_id);
            if (!u) return null;
            return {
                id: u.id,
                firstName: u.first_name,
                lastName: u.last_name,
                profileImage: u.profile_image,
                activeCount: stat._count._all,
            };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

    return NextResponse.json({
        hero: { imageUrl: heroUrl },
        categories: CATEGORIES.map((c) => ({
            style: c.name,
            label: c.name,
            imageUrl: c.image,
        })),
        trending: trendingRows.map((l) =>
            serializeListingSummaryForMobile(l, { effectivePrice: homePriceMap.get(l.id) }),
        ),
        featured: featuredRows.map((l) =>
            serializeListingSummaryForMobile(l, { effectivePrice: homePriceMap.get(l.id) }),
        ),
        featuredSellers,
    });
}
