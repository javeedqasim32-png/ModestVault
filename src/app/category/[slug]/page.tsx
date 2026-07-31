// Category landing pages — /category/abayas, /category/kaftans,
// /category/dresses, /category/sarees, /category/suits,
// /category/accessories. Sibling to /style/[slug] — same shape, filters
// by category instead of style.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { serializeListing } from "@/lib/serialization";
import { getPrimaryListingImage } from "@/lib/listing-images";
import ListingCard from "@/components/marketplace/ListingCard";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo/json-ld";
import {
    findCategoryBySlug,
    CATEGORY_LANDING_PAGES,
} from "@/lib/seo/landing-pages";
import { absoluteUrl } from "@/lib/seo/site";

const MAX_INLINE_LISTINGS = 60;

export const revalidate = 600;

export function generateStaticParams() {
    return CATEGORY_LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const page = findCategoryBySlug(slug);
    if (!page) {
        return buildPageMetadata({
            title: "Category not found",
            description: "This category page isn't available on Modaire.",
            path: `/category/${slug}`,
        });
    }
    return buildPageMetadata({
        title: page.title,
        description: page.description,
        path: `/category/${page.slug}`,
    });
}

export default async function CategoryLandingPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const page = findCategoryBySlug(slug);
    if (!page) notFound();

    const listings = await prisma.listing.findMany({
        where: {
            category: page.taxonomyValue,
            status: "AVAILABLE",
            moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
        },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
        },
        orderBy: [{ is_featured: "desc" }, { created_at: "desc" }],
        take: MAX_INLINE_LISTINGS,
    });

    const listingsWithCover = listings.map((listing) => ({
        ...serializeListing(listing),
        coverImage: getPrimaryListingImage(listing, "card"),
    }));

    const browseHref = `/browse?categories=${encodeURIComponent(page.taxonomyValue)}`;

    return (
        <>
            <JsonLd
                data={breadcrumbJsonLd([
                    { name: "Home", path: "/" },
                    { name: "Browse", path: "/browse" },
                    { name: page.h1, path: `/category/${page.slug}` },
                ])}
            />
            <JsonLd
                data={{
                    "@context": "https://schema.org",
                    "@type": "CollectionPage",
                    name: page.h1,
                    description: page.description,
                    url: absoluteUrl(`/category/${page.slug}`),
                    numberOfItems: listingsWithCover.length,
                }}
            />

            <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
                <header className="mx-auto max-w-3xl text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7667]">
                        <Link href="/browse" className="hover:text-[#4a3328]">Browse</Link>
                        <span className="mx-2">·</span>
                        <span>Category</span>
                    </p>
                    <h1 className="mt-3 font-serif text-3xl leading-tight text-foreground sm:text-4xl">
                        {page.h1}
                    </h1>
                    <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                        {page.intro}
                    </p>
                </header>

                {listingsWithCover.length === 0 ? (
                    <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/70 px-6 py-16 text-center">
                        <Package className="mb-3 h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                            No {page.taxonomyValue.toLowerCase()} available right now — check back soon.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                            {listingsWithCover.map((listing) => (
                                <ListingCard
                                    key={listing.id}
                                    href={`/listings/${listing.id}`}
                                    imageUrl={listing.coverImage}
                                    title={listing.title}
                                    price={listing.price}
                                    category={listing.category}
                                    condition={listing.condition}
                                    status={listing.status}
                                    listingId={listing.id}
                                    compact
                                />
                            ))}
                        </div>
                        {listingsWithCover.length >= MAX_INLINE_LISTINGS ? (
                            <div className="mt-10 flex justify-center">
                                <Link
                                    href={browseHref}
                                    className="inline-flex items-center gap-2 rounded-full border border-[#d7cdc4] bg-white px-5 py-2.5 text-sm font-medium text-[#5f4a3c] hover:bg-[#f2ebe4]"
                                >
                                    See all {page.taxonomyValue.toLowerCase()} on Modaire
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </>
    );
}
