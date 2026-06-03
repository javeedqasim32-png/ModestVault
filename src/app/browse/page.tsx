import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Package } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeListing } from "@/lib/serialization";
import { getUserSlugMap } from "@/lib/user-slugs";
import { getPrimaryListingImage } from "@/lib/listing-images";
import BrowseFiltersClient from "@/components/marketplace/BrowseFiltersClient";
import FavoriteButton from "@/components/marketplace/FavoriteButton";
import { getFavoriteListingIdsForSessionUser } from "@/app/actions/favorites";
import {
    buildListingBrowseWhere,
    getAvailableFilterOptions,
    parseBrowseFilters,
    type ListingBrowseFilters,
} from "@/lib/listingFilters";

export const dynamic = "force-dynamic";

function toSizeCode(size?: string | null) {
    const normalized = size?.trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "small") return "S";
    if (normalized === "medium") return "M";
    if (normalized === "large") return "L";
    if (normalized === "xlarge" || normalized === "x-large" || normalized === "extra large") return "XL";
    if (normalized === "xxlarge" || normalized === "xx-large" || normalized === "extra extra large") return "XXL";
    return normalized.toUpperCase();
}

function normalizePriceRange(filters: ListingBrowseFilters) {
    if (
        typeof filters.minPrice === "number" &&
        typeof filters.maxPrice === "number" &&
        filters.minPrice > filters.maxPrice
    ) {
        return {
            ...filters,
            minPrice: filters.maxPrice,
            maxPrice: filters.minPrice,
        };
    }
    return filters;
}

export default async function BrowsePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const parsedFilters = parseBrowseFilters(params);
    const filters = normalizePriceRange(parsedFilters);
    
    const sort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
    const orderBy: Prisma.ListingOrderByWithRelationInput | Prisma.ListingOrderByWithRelationInput[] =
        sort === "views"
            ? [{ view_count: "desc" }, { created_at: "desc" }]
            : { created_at: "desc" };

    if (filters.search) {
        const searchTerms = filters.search.trim().split(/\s+/);
        const exactUserMatch = await prisma.user.findFirst({
            where: {
                AND: searchTerms.map((term) => ({
                    OR: [
                        { first_name: { contains: term, mode: "insensitive" } },
                        { last_name: { contains: term, mode: "insensitive" } }
                    ]
                }))
            },
            select: { id: true }
        });
        if (exactUserMatch) {
            const slugMap = await getUserSlugMap();
            redirect(`/${slugMap.get(exactUserMatch.id) || exactUserMatch.id}`);
        }
    }

    // Split into two queries so partial-accepted listings always rank after
    // fully-approved ones regardless of sort mode (newest / most viewed).
    // Within each tier the orderBy is respected; we concat with approved first.
    //
    // We also boost "featured overflow" — listings the admin marked featured
    // but didn't fit in the Home rail's top 8 — to the top of Explore. The
    // top 8 IDs come from a tiny ID-only query that hits the partial index
    // `Listing_is_featured_featured_order_idx`, so the extra DB cost is
    // sub-millisecond. Partitioning is in-memory over rows we already fetch.
    const baseWhere = buildListingBrowseWhere(filters);
    const [approvedListings, partialListings, availableListings, homeTopFeaturedIds] = await Promise.all([
        prisma.listing.findMany({
            where: baseWhere,
            orderBy,
            include: {
                images: {
                    orderBy: { imageOrder: "asc" },
                    take: 1,
                    select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
                },
            },
        }),
        prisma.listing.findMany({
            where: { ...baseWhere, moderation_status: "PARTIAL_APPROVED" },
            orderBy,
            include: {
                images: {
                    orderBy: { imageOrder: "asc" },
                    take: 1,
                    select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
                },
            },
        }),
        prisma.listing.findMany({
            where: {
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
            select: {
                style: true,
                category: true,
                subcategory: true,
                type: true,
                size: true,
                condition: true,
            },
        }),
        prisma.listing.findMany({
            where: { is_featured: true, moderation_status: "APPROVED", status: "AVAILABLE" },
            orderBy: [{ featured_order: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
            take: 8,
            select: { id: true },
        }),
    ]);

    // Partition approved into "featured overflow" (admin-marked featured but
    // ranked below the Home top 8) and everything else. Overflow gets the
    // top-of-Explore slot so those listings still surface despite not fitting
    // on Home. Listings inside the top 8 stay in their natural date order on
    // Explore — they're already prominent on Home.
    const homeTopFeaturedSet = new Set(homeTopFeaturedIds.map((row) => row.id));
    const featuredOverflowListings = approvedListings.filter(
        (listing) => listing.is_featured && !homeTopFeaturedSet.has(listing.id)
    );
    const otherApprovedListings = approvedListings.filter(
        (listing) => !listing.is_featured || homeTopFeaturedSet.has(listing.id)
    );
    const filteredListings = [...featuredOverflowListings, ...otherApprovedListings, ...partialListings];

    const listingsWithCover = filteredListings.map((listing) => ({
        ...serializeListing(listing),
        coverImage: getPrimaryListingImage(listing, "card"),
    }));
    const favoriteListingIds = new Set(
        await getFavoriteListingIdsForSessionUser(listingsWithCover.map((listing) => listing.id))
    );

    const availableOptions = getAvailableFilterOptions(availableListings, {
        categories: filters.categories,
        subcategories: filters.subcategories,
    });

    return (
        <>
            <div className="min-h-screen bg-[#f4efea] px-4 pb-28 pt-3 sm:hidden">
                <BrowseFiltersClient appliedFilters={filters} availableOptions={availableOptions} />

                {listingsWithCover.length === 0 ? (
                    <div className="mt-8 flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-card/70 px-6 py-16 text-center">
                        <Package className="mb-4 h-10 w-10 text-muted-foreground/50" />
                        <h2 className="font-serif text-3xl text-foreground">No items found</h2>
                        <p className="mt-2 text-sm text-muted-foreground">Try changing your filters or search.</p>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-2 gap-[10px] pb-4">
                        {listingsWithCover.map((listing) => (
                            <Link
                                key={listing.id}
                                href={`/listings/${listing.id}`}
                                className="group relative flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-[#ece3dc] bg-white transition-transform duration-150 hover:-translate-y-0.5"
                            >
                                <div className="relative aspect-[3/4] w-full min-w-0 overflow-hidden bg-[#faf8f6]">
                                    <Image
                                        src={listing.coverImage}
                                        alt={listing.title}
                                        fill
                                        className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                                        sizes="50vw"
                                    />
                                    <div className="absolute right-[6px] top-[6px] z-10 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-white/90">
                                        <div className="scale-[0.65]">
                                            <FavoriteButton listingId={listing.id} initialFavorited={favoriteListingIds.has(listing.id)} />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex min-w-0 flex-col px-[10px] pb-[10px] pt-[8px]">
                                    <div className="mb-[2px] truncate text-[9px] uppercase tracking-[0.1em] text-[#8a7667]">
                                        {listing.category}
                                    </div>
                                    <h3 className="mb-[2px] line-clamp-2 text-[12px] font-normal leading-[1.3] text-[#2f2925]" title={listing.title}>
                                        {listing.title}
                                    </h3>
                                    <div className="mt-[1px] flex items-end justify-between gap-2">
                                        <p className="truncate text-[13px] font-semibold text-[#2f2925]">
                                            ${Number(listing.price).toLocaleString()}
                                        </p>
                                        {listing.size ? (
                                            <span className="shrink-0 text-[12px] font-normal uppercase tracking-[0.04em] text-[#8a7667]">
                                                {toSizeCode(listing.size)}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <div className="hidden bg-[#f4efea] px-4 py-6 sm:block sm:px-6 lg:px-8">
                <div className="mx-auto flex w-full max-w-[1360px] flex-col overflow-hidden rounded-[2rem] border border-border/80 bg-[#f4efea] shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
                    <section className="border-b border-border/80 bg-[linear-gradient(180deg,#fbf7f4_0%,#f2ebe5_100%)] px-6 py-8 lg:px-10">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Marketplace</p>
                        <h1 className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">Explore Curated Listings</h1>
                        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                            Search and apply filters to quickly find items by style, taxonomy, size, and price range.
                        </p>
                    </section>

                    <section className="p-6 lg:p-8">
                        <BrowseFiltersClient appliedFilters={filters} availableOptions={availableOptions} />

                        {listingsWithCover.length === 0 ? (
                            <div className="mt-8 flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-border bg-background/60 px-6 py-24 text-center">
                                <Package className="mb-6 h-12 w-12 text-muted-foreground/40" />
                                <h2 className="font-serif text-3xl text-foreground">No items found</h2>
                                <p className="mt-3 max-w-sm text-muted-foreground">
                                    Try a different combination of filters.
                                </p>
                            </div>
                        ) : (
                            <div className="mt-8 grid grid-cols-2 gap-[10px] pb-4 sm:grid-cols-3 lg:grid-cols-4">
                                {listingsWithCover.map((listing) => (
                                    <Link
                                        key={listing.id}
                                        href={`/listings/${listing.id}`}
                                        className="group relative flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-[#ece3dc] bg-white transition-transform duration-150 hover:-translate-y-0.5"
                                    >
                                        <div className="relative aspect-[3/4] w-full min-w-0 overflow-hidden bg-[#faf8f6]">
                                            <Image
                                                src={listing.coverImage}
                                                alt={listing.title}
                                                fill
                                                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                                                sizes="(max-width: 1024px) 33vw, 25vw"
                                            />
                                            <div className="absolute right-[6px] top-[6px] z-10 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-white/90">
                                                <div className="scale-[0.65]">
                                                    <FavoriteButton listingId={listing.id} initialFavorited={favoriteListingIds.has(listing.id)} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex min-w-0 flex-col px-[10px] pb-[10px] pt-[8px]">
                                            <div className="mb-[2px] truncate text-[9px] uppercase tracking-[0.1em] text-[#8a7667]">
                                                {listing.category}
                                            </div>
                                            <h3 className="mb-[2px] line-clamp-2 text-[12px] font-normal leading-[1.3] text-[#2f2925]" title={listing.title}>
                                                {listing.title}
                                            </h3>
                                            <div className="mt-[1px] flex items-end justify-between gap-2">
                                                <p className="truncate text-[13px] font-semibold text-[#2f2925]">
                                                    ${Number(listing.price).toLocaleString()}
                                                </p>
                                                {listing.size ? (
                                                    <span className="shrink-0 text-[12px] font-normal uppercase tracking-[0.04em] text-[#8a7667]">
                                                        {toSizeCode(listing.size)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </>
    );
}
