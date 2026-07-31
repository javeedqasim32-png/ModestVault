// Style landing pages — /style/bridals, /style/formals, /style/festive-pret,
// /style/modest-wear, /style/western. Each is a keyword-optimized page
// listing every AVAILABLE + APPROVED listing in that style. Google indexes
// them separately from /browse (distinct URL, distinct H1 + intro copy)
// so the site ranks for the specific phrases each page targets.
//
// Slug validation short-circuits to 404 for unknown styles — prevents
// Google from indexing arbitrary /style/foo garbage URLs.

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
    findStyleBySlug,
    STYLE_LANDING_PAGES,
} from "@/lib/seo/landing-pages";
import { absoluteUrl } from "@/lib/seo/site";

// Cap on inline listings shown on the page — beyond this, a "See all"
// link routes to /browse?styles=... for the full filtered view. Keeps
// the landing page fast to render + fast to crawl.
const MAX_INLINE_LISTINGS = 60;

export const revalidate = 600; // 10 minutes — copy is static; listings drift slowly

// Static generation for every style page at build time. Any unknown
// slug falls through to notFound() at request time.
export function generateStaticParams() {
    return STYLE_LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const page = findStyleBySlug(slug);
    if (!page) {
        return buildPageMetadata({
            title: "Style not found",
            description: "This style page isn't available on Modaire.",
            path: `/style/${slug}`,
        });
    }
    return buildPageMetadata({
        title: page.title,
        description: page.description,
        path: `/style/${page.slug}`,
    });
}

export default async function StyleLandingPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const page = findStyleBySlug(slug);
    if (!page) notFound();

    const listings = await prisma.listing.findMany({
        where: {
            style: page.taxonomyValue,
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

    const browseHref = `/browse?styles=${encodeURIComponent(page.taxonomyValue)}`;

    return (
        <>
            {/* Product / Collection breadcrumb — helps Google understand
                the hierarchy and shows Home > Browse > Style in the SERP. */}
            <JsonLd
                data={breadcrumbJsonLd([
                    { name: "Home", path: "/" },
                    { name: "Browse", path: "/browse" },
                    { name: page.h1, path: `/style/${page.slug}` },
                ])}
            />
            {/* CollectionPage — tells Google this URL is a curated group
                of Products, which improves how it's indexed relative to
                individual listing pages. */}
            <JsonLd
                data={{
                    "@context": "https://schema.org",
                    "@type": "CollectionPage",
                    name: page.h1,
                    description: page.description,
                    url: absoluteUrl(`/style/${page.slug}`),
                    numberOfItems: listingsWithCover.length,
                }}
            />

            <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
                {/* SEO hero. H1 + intro paragraph are the body copy Google
                    actually reads for ranking on the target keyword bucket. */}
                <header className="mx-auto max-w-3xl text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7667]">
                        <Link href="/browse" className="hover:text-[#4a3328]">Browse</Link>
                        <span className="mx-2">·</span>
                        <span>Style</span>
                    </p>
                    <h1 className="mt-3 font-serif text-3xl leading-tight text-foreground sm:text-4xl">
                        {page.h1}
                    </h1>
                    <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                        {page.intro}
                    </p>
                </header>

                {/* Inline grid of listings in this bucket. Same visual
                    shape as browse's grid; keeps design coherent. */}
                {listingsWithCover.length === 0 ? (
                    <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/70 px-6 py-16 text-center">
                        <Package className="mb-3 h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                            No {page.taxonomyValue} listings available right now — check back soon.
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
