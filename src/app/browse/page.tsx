import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { serializeListing } from "@/lib/serialization";
import { getPrimaryListingImage } from "@/lib/listing-images";
import ListingCard from "@/components/marketplace/ListingCard";
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

    const [filteredListings, availableListings] = await Promise.all([
        prisma.listing.findMany({
            where: buildListingBrowseWhere(filters),
            orderBy: { created_at: "desc" },
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
                moderation_status: "APPROVED",
            },
            select: {
                style: true,
                category: true,
                subcategory: true,
                type: true,
                size: true,
            },
        }),
    ]);

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
            <div className="min-h-screen bg-[#f7f3ef] px-4 pb-28 pt-3 sm:hidden">
                <BrowseFiltersClient appliedFilters={filters} availableOptions={availableOptions} />

                {listingsWithCover.length === 0 ? (
                    <div className="mt-8 flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-card/70 px-6 py-16 text-center">
                        <Package className="mb-4 h-10 w-10 text-muted-foreground/50" />
                        <h2 className="font-serif text-3xl text-foreground">No items found</h2>
                        <p className="mt-2 text-sm text-muted-foreground">Try changing your filters or search.</p>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-2 gap-3">
                        {listingsWithCover.map((listing) => (
                            <Link key={listing.id} href={`/listings/${listing.id}`} className="block">
                                <div className="relative overflow-hidden rounded-[0.9rem] border border-border/70 bg-transparent">
                                    <div className="relative aspect-[3/4]">
                                        <Image src={listing.coverImage} alt={listing.title} fill className="object-contain object-center" sizes="50vw" />
                                    </div>
                                    <div className="absolute right-2 top-2">
                                        <FavoriteButton
                                            listingId={listing.id}
                                            initialFavorited={favoriteListingIds.has(listing.id)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-card/90 shadow-sm"
                                        />
                                    </div>
                                </div>
                                <p className="mt-2 line-clamp-1 text-[1rem] leading-tight text-foreground">{listing.title}</p>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{listing.description}</p>
                                <p className="mt-1 text-[1.4rem] leading-none text-foreground">${Number(listing.price).toLocaleString()}</p>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <div className="hidden px-4 py-6 sm:block sm:px-6 lg:px-8">
                <div className="mx-auto flex w-full max-w-[1360px] flex-col overflow-hidden rounded-[2rem] border border-border/80 bg-card shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
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
                            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {listingsWithCover.map((listing, index) => (
                                    <ListingCard
                                        key={listing.id}
                                        href={`/listings/${listing.id}`}
                                        imageUrl={listing.coverImage}
                                        title={listing.title}
                                        description={listing.description}
                                        price={Number(listing.price)}
                                        category={listing.category}
                                        condition={listing.condition}
                                        featured={index % 5 === 0}
                                        showFullImage
                                        listingId={listing.id}
                                        isFavorited={favoriteListingIds.has(listing.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </>
    );
}
