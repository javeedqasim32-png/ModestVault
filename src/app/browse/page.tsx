import { prisma } from "@/lib/prisma";
import { getPrimaryListingImage } from "@/lib/listing-images";
import Link from "next/link";
import Image from "next/image";
import { Heart, Package, Search, SlidersHorizontal } from "lucide-react";
import ListingCard from "@/components/marketplace/ListingCard";

export const dynamic = "force-dynamic";

const categories = ["Everyday Modest", "Luxury Pret", "Formal Wear", "Abayas", "Wedding", "Accessories"];

function getParamValue(value: string | string[] | undefined) {
    if (!value) return "";
    return Array.isArray(value) ? value[0] ?? "" : value;
}

export default async function BrowsePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const selectedSize = getParamValue(params.size);
    const minPriceRaw = getParamValue(params.minPrice);
    const maxPriceRaw = getParamValue(params.maxPrice);
    const showMobileFilters = getParamValue(params.filters) === "1";

    const minPrice = minPriceRaw ? Number(minPriceRaw) : undefined;
    const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;
    const hasMinPrice = typeof minPrice === "number" && Number.isFinite(minPrice);
    const hasMaxPrice = typeof maxPrice === "number" && Number.isFinite(maxPrice);

    const sizeFilter = selectedSize.trim();

    const filterQuery = new URLSearchParams();
    if (sizeFilter) filterQuery.set("size", sizeFilter);
    if (minPriceRaw) filterQuery.set("minPrice", minPriceRaw);
    if (maxPriceRaw) filterQuery.set("maxPrice", maxPriceRaw);

    const mobileFilterHref = (() => {
        const next = new URLSearchParams(filterQuery);
        next.set("filters", "1");
        return `/browse?${next.toString()}`;
    })();

    const listings = await prisma.listing.findMany({
        where: {
            status: "AVAILABLE",
            ...(sizeFilter
                ? {
                    size: {
                        equals: sizeFilter,
                        mode: "insensitive",
                    },
                }
                : {}),
            ...(hasMinPrice || hasMaxPrice
                ? {
                    price: {
                        ...(hasMinPrice ? { gte: minPrice } : {}),
                        ...(hasMaxPrice ? { lte: maxPrice } : {}),
                    },
                }
                : {}),
        },
        orderBy: { created_at: "desc" },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
        },
    });
    const listingsWithCover = listings.map((listing) => ({
        ...listing,
        coverImage: getPrimaryListingImage(listing, "card"),
    }));

    return (
        <>
            <div className="min-h-screen bg-[#f7f3ef] px-4 pb-28 pt-3 sm:hidden">
                <div className="mb-4 flex items-center gap-2 rounded-full border border-border/80 bg-card/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <div className="flex flex-1 items-center gap-3 rounded-full px-3 py-3">
                        <Search className="h-5 w-5 text-muted-foreground" />
                        <input
                            placeholder="Search designers, abayas, pret..."
                            className="w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
                        />
                    </div>
                    <Link
                        href={mobileFilterHref}
                        className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-[#f1ebe5] px-4 py-3 text-base text-foreground"
                    >
                        <SlidersHorizontal className="h-5 w-5" />
                        Filter
                    </Link>

                </div>

                {showMobileFilters ? (
                    <form className="mb-4 rounded-[1.2rem] border border-border/80 bg-card p-4" method="get" action="/browse">
                        <div className="grid grid-cols-1 gap-3">
                            <label className="text-sm text-foreground">
                                Size
                                <select
                                    name="size"
                                    defaultValue={sizeFilter}
                                    className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                                >
                                    <option value="">All sizes</option>
                                    <option value="XS">XS</option>
                                    <option value="S">S</option>
                                    <option value="M">M</option>
                                    <option value="L">L</option>
                                    <option value="XL">XL</option>
                                </select>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-sm text-foreground">
                                    Min price
                                    <input
                                        type="number"
                                        name="minPrice"
                                        min="0"
                                        step="1"
                                        defaultValue={minPriceRaw}
                                        className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                                    />
                                </label>
                                <label className="text-sm text-foreground">
                                    Max price
                                    <input
                                        type="number"
                                        name="maxPrice"
                                        min="0"
                                        step="1"
                                        defaultValue={maxPriceRaw}
                                        className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                                    />
                                </label>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-xs uppercase tracking-[0.2em] text-primary-foreground"
                                >
                                    Apply
                                </button>
                                <Link
                                    href="/browse"
                                    className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-xs uppercase tracking-[0.2em] text-foreground"
                                >
                                    Clear
                                </Link>
                            </div>
                        </div>
                    </form>
                ) : null}

                {listingsWithCover.length === 0 ? (
                    <div className="mt-14 flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-card/70 px-6 py-16 text-center">
                        <Package className="mb-4 h-10 w-10 text-muted-foreground/50" />
                        <h2 className="font-serif text-3xl text-foreground">No items yet</h2>
                        <p className="mt-2 text-sm text-muted-foreground">Listings will appear here once sellers publish inventory.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                        {listingsWithCover.map((listing) => (
                            <Link key={listing.id} href={`/listings/${listing.id}`} className="block">
                                <div className="relative overflow-hidden rounded-[0.9rem] border border-border/70 bg-muted">
                                    <div className="relative aspect-[3/4]">
                                        <Image src={listing.coverImage} alt={listing.title} fill className="object-contain bg-card/60 p-1" sizes="33vw" />
                                    </div>
                                    <button
                                        aria-label="Save item"
                                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-foreground shadow-sm"
                                    >
                                        <Heart className="h-4 w-4" />
                                    </button>
                                </div>
                                <p className="mt-2 line-clamp-1 text-[1.15rem] leading-tight text-foreground">{listing.title}</p>
                                <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{listing.description}</p>
                                <p className="mt-1 text-[1.9rem] leading-none text-foreground">${Number(listing.price).toLocaleString()}</p>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <div className="hidden px-4 py-6 sm:block sm:px-6 lg:px-8">
                <div className="mx-auto flex w-full max-w-[1360px] flex-col overflow-hidden rounded-[2rem] border border-border/80 bg-card shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
                    <section className="border-b border-border/80 bg-[linear-gradient(180deg,#fbf7f4_0%,#f2ebe5_100%)] px-6 py-8 lg:px-10">
                        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Marketplace</p>
                                <h1 className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">Explore Curated Listings</h1>
                                <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                                    Browse a boutique-style marketplace with the same listings, seller onboarding, and checkout flow already powering the backend.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                                <span className="rounded-full border border-border bg-card px-4 py-2">{listingsWithCover.length} items live</span>
                                <span className="rounded-full border border-border bg-card px-4 py-2">Fresh arrivals first</span>
                            </div>
                        </div>

                        <div className="mt-8 flex flex-wrap gap-3">
                            {categories.map((category) => (
                                <button
                                    key={category}
                                    className="rounded-full border border-border bg-card px-5 py-3 text-sm text-foreground hover:bg-background"
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="grid gap-0 lg:grid-cols-[280px_1fr]">
                        <aside className="border-b border-border/80 bg-[linear-gradient(180deg,#f7f2ee_0%,#f0e6df_100%)] p-6 lg:border-b-0 lg:border-r lg:p-8">
                            <div className="space-y-8">
                                <div className="rounded-[1.5rem] border border-border/80 bg-card p-4">
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                        <SlidersHorizontal className="h-4 w-4" />
                                        Refine edit
                                    </div>
                                    <div className="mt-4">
                                        <form className="space-y-3" method="get" action="/browse">
                                            <label className="block text-sm text-foreground">
                                                Size
                                                <select
                                                    name="size"
                                                    defaultValue={sizeFilter}
                                                    className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                                                >
                                                    <option value="">All sizes</option>
                                                    <option value="XS">XS</option>
                                                    <option value="S">S</option>
                                                    <option value="M">M</option>
                                                    <option value="L">L</option>
                                                    <option value="XL">XL</option>
                                                </select>
                                            </label>
                                            <label className="block text-sm text-foreground">
                                                Min price
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    name="minPrice"
                                                    defaultValue={minPriceRaw}
                                                    className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                                                />
                                            </label>
                                            <label className="block text-sm text-foreground">
                                                Max price
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    name="maxPrice"
                                                    defaultValue={maxPriceRaw}
                                                    className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                                                />
                                            </label>
                                            <div className="flex items-center gap-2 pt-1">
                                                <button
                                                    type="submit"
                                                    className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-[10px] uppercase tracking-[0.2em] text-primary-foreground"
                                                >
                                                    Apply
                                                </button>
                                                <Link
                                                    href="/browse"
                                                    className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-[10px] uppercase tracking-[0.2em] text-foreground"
                                                >
                                                    Clear
                                                </Link>
                                            </div>
                                        </form>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Collections</p>
                                    <div className="mt-4 space-y-3">
                                        {["Soft neutrals", "Heirloom embroidery", "Statement sleeves", "Evening edits"].map((item) => (
                                            <button key={item} className="block text-left text-base text-foreground hover:text-primary">
                                                {item}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </aside>

                        <div className="p-6 lg:p-8">
                            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex flex-1 items-center gap-3 rounded-full border border-border bg-background px-5 py-4">
                                    <Search className="h-4 w-4 text-muted-foreground" />
                                    <input
                                        placeholder="Search items, brands, or styles..."
                                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                                    />
                                </div>
                                <div className="text-sm text-muted-foreground">Showing live marketplace inventory</div>
                            </div>

                            {listingsWithCover.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-border bg-background/60 px-6 py-24 text-center">
                                    <Package className="mb-6 h-12 w-12 text-muted-foreground/40" />
                                    <h2 className="font-serif text-3xl text-foreground">No items found</h2>
                                    <p className="mt-3 max-w-sm text-muted-foreground">
                                        Your data layer is intact. Once listings are available, they will appear here in the updated editorial grid.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
}
