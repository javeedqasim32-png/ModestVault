import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { addToCartAndRedirect } from "@/app/actions/cart";
import { getFavoriteListingIdsForSessionUser } from "@/app/actions/favorites";
import { getOrderedListingGallery, getPrimaryListingImage } from "@/lib/listing-images";
import { getEffectivePriceForListing, getEffectivePricesForListings } from "@/lib/promotions/get-effective-price";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd, breadcrumbJsonLd, productJsonLd } from "@/lib/seo/json-ld";
import { Pencil, Star, ChevronRight } from "lucide-react";
import Link from "next/link";
import RecentlyViewedTracker from "@/components/marketplace/RecentlyViewedTracker";
import { ViewContentPixel } from "@/components/analytics/ViewContentPixel";
import FavoriteButton from "@/components/marketplace/FavoriteButton";
import ListingImageGallery from "@/components/marketplace/ListingImageGallery";
import ShareListingButton from "@/components/marketplace/ShareListingButton";
import SmartBackButton from "@/components/layout/SmartBackButton";
import AddToBagButton from "@/components/listings/AddToBagButton";
import MessageSellerButton from "@/components/listings/MessageSellerButton";
import MakeOfferButton from "@/components/listings/MakeOfferButton";
import FeaturedListingTile from "@/components/listings/FeaturedListingTile";
import { getSimilarListings, recommendationImage } from "@/lib/listings/recommendations";
import ListingComments from "@/components/listings/ListingComments";
import { listComments, resolveViewer } from "@/lib/comments";
import { getOfferEligibility } from "@/lib/offers";

import { getUserSlugMap } from "@/lib/user-slugs";

export const dynamic = "force-dynamic";

// Per-listing metadata + OG card. Google shows title/description in
// search results and social crawlers (Facebook, iMessage, Twitter)
// pull the OG image + title/description for link previews. Slightly
// slimmer prisma query than the page below — we don't need the
// reviews tree for meta tags.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
        },
    });
    if (!listing) {
        return buildPageMetadata({
            title: "Listing not found",
            description: "This listing is no longer available on Modaire.",
            path: `/listings/${id}`,
        });
    }
    const primaryImage = getPrimaryListingImage(listing, "detail");
    const cleanDescription = (listing.description || "").replace(/\s+/g, " ").trim();
    // Meta descriptions are truncated by search engines around 160
    // chars — trim + append price so the snippet is informative even
    // when it gets cut.
    const trimmedDescription = cleanDescription.length > 140
        ? cleanDescription.slice(0, 137) + "..."
        : cleanDescription || `${listing.brand ? listing.brand + " " : ""}${listing.category}${listing.size ? ", size " + listing.size : ""} on Modaire.`;
    return buildPageMetadata({
        title: listing.title,
        description: `${trimmedDescription} $${Number(listing.price).toFixed(2)} on Modaire — modest fashion marketplace.`,
        path: `/listings/${id}`,
        image: primaryImage || undefined,
    });
}

const MEASUREMENTS_MARKER = "\n\nMeasurements:\n";

function splitDescriptionAndMeasurements(description: string) {
    const regex = /(?:\r?\n){2}Measurements:\r?\n/i;
    const match = description.match(regex);
    if (!match || match.index === undefined) {
        return { description: description.trim(), measurements: "" };
    }
    const markerIndex = match.index;
    const markerLength = match[0].length;
    return {
        description: description.slice(0, markerIndex).trim(),
        measurements: description.slice(markerIndex + markerLength).trim(),
    };
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();

    const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                select: {
                    id: true,
                    imageUrl: true,
                    thumbUrl: true,
                    mediumUrl: true,
                    imageOrder: true,
                },
            },
            user: {
                select: {
                    first_name: true,
                    last_name: true,
                    profile_image: true,
                    reviewsReceived: {
                        orderBy: { created_at: "desc" },
                        select: {
                            id: true,
                            rating: true,
                            text: true,
                            created_at: true,
                            reviewer: {
                                select: {
                                    first_name: true,
                                    last_name: true,
                                },
                            },
                        },
                    },
                }
            }
        }
    });

    if (!listing) {
        notFound();
    }

    await prisma.listing.updateMany({
        where: { id },
        data: {
            view_count: {
                increment: 1,
            },
        },
    });

    const isOwner = session?.user?.id === listing.user_id;
    const isAuthed = !!session?.user?.id;
    const isAvailable = listing.status === "AVAILABLE";
    const orderedImages = getOrderedListingGallery(listing);
    // "Similar items" rendered below the comments (any seller, this one
    // included), using the same tile + promo-aware prices as the home page.
    // Their ids are folded into the favorites lookup so every heart is right.
    const similarListings = await getSimilarListings(listing, 8);
    const [favoriteListingIds, similarPrices] = await Promise.all([
        getFavoriteListingIdsForSessionUser([listing.id, ...similarListings.map((l) => l.id)]).then((ids) => new Set(ids)),
        getEffectivePricesForListings(similarListings),
    ]);
    // Threaded comments, loaded here so the section renders with no flash and
    // the viewer's delete permissions are already resolved.
    const comments = await listComments(listing.id, await resolveViewer(session?.user?.id ?? null));
    const sellerFullName = `${listing.user.first_name} ${listing.user.last_name}`.trim();
    const slugMap = await getUserSlugMap();
    const sellerSlug = slugMap.get(listing.user_id) || listing.user_id;
    const sellerInitial = (listing.user.first_name?.[0] || "M").toUpperCase();
    const sellerReviewCount = listing.user.reviewsReceived.length;
    const sellerRatingAverage = sellerReviewCount
        ? Number((listing.user.reviewsReceived.reduce((sum, review) => sum + review.rating, 0) / sellerReviewCount).toFixed(1))
        : 0;
    const { description: cleanDescription, measurements } = splitDescriptionAndMeasurements(listing.description || "");
    // Server-side promo lookup — never trust the client for pricing. Same
    // helper the checkout action uses, so what you see here is what you pay.
    const effectivePrice = await getEffectivePriceForListing(listing.id);
    const hasPromo = effectivePrice.discountPercent > 0;

    // Offer eligibility (3.1): whether to show "Make an Offer" and whether the
    // buyer already has an active offer to link to.
    const offerElig = await getOfferEligibility(session?.user?.id ?? null, listing.id);
    const canMakeOffer = offerElig.eligible;
    const existingOfferId = offerElig.eligible ? offerElig.activeOfferId ?? null : null;
    const metaPills = [
        { label: "Size", value: listing.size || "M" },
        { label: "Condition", value: listing.condition || "Like new" },
        { label: "Category", value: listing.category || "Suits" },
        ...(listing.subcategory || listing.type
            ? [{ label: listing.subcategory ? "" : "Type", value: listing.subcategory || listing.type || "" }]
            : []),
        ...(listing.brand ? [{ label: "Brand", value: listing.brand }] : []),
    ];

    return (
        <div className="min-h-screen bg-[#EFE7DE]">
            {/* Product schema — drives price + availability + condition
                rich snippets in Google search results. Breadcrumb schema
                shows Home > Browse > Listing above the URL in the SERP. */}
            <JsonLd
                data={productJsonLd({
                    id: listing.id,
                    title: listing.title,
                    description: cleanDescription,
                    price: Number(effectivePrice.effectiveCents) / 100,
                    imageUrls: orderedImages.map((img) => img.mediumUrl || img.originalUrl),
                    brand: listing.brand,
                    category: listing.category,
                    status: listing.status,
                })}
            />
            <JsonLd
                data={breadcrumbJsonLd([
                    { name: "Home", path: "/" },
                    { name: "Browse", path: "/browse" },
                    { name: listing.title, path: `/listings/${listing.id}` },
                ])}
            />
            <RecentlyViewedTracker listingId={listing.id} viewerId={session?.user?.id ?? null} />
            <ViewContentPixel
                listingId={listing.id}
                title={listing.title}
                price={Number(effectivePrice ?? listing.price)}
                category={listing.category}
            />
            <div className="mx-auto w-full max-w-[760px] pb-36">
                <div className="px-4 pb-3 pt-4">
                    <SmartBackButton
                        fallbackHref="/browse"
                        className="inline-flex items-center gap-1 text-[12px] text-[#8a7667] hover:text-[#2f2925]"
                    />
                </div>

                <div className="relative">
                    <ListingImageGallery
                        images={orderedImages}
                        title={listing.title}
                        isSold={listing.status === "SOLD"}
                    />
                    {/*
                       Badge is absolutely positioned relative to this wrapper.
                       ListingImageGallery insets the actual image by px-4 (16px)
                       horizontally, so left-6 (24px) lands the badge ~8px inside
                       the image's rounded edge. top-3 (12px) sits it just below
                       the top edge — the gallery has no top padding.
                    */}
                    {hasPromo ? (
                        <span className="absolute left-6 top-3 z-10 rounded-full bg-[#4a3328] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-md">
                            {effectivePrice.discountPercent}% Off
                        </span>
                    ) : null}
                </div>

                <div className="mt-1 px-4 pt-2">
                    <h1
                        className="text-[24px] leading-[1.2] text-[#2f2925]"
                        style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}
                    >
                        {listing.title}
                    </h1>
                    {hasPromo ? (
                        <p className="mt-1 flex items-baseline gap-2 leading-none">
                            <span className="text-[22px] font-semibold text-[#4a3328]">
                                ${(effectivePrice.effectiveCents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[16px] font-medium text-[#8a7667] line-through">
                                ${(effectivePrice.originalCents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                        </p>
                    ) : (
                        <p className="mt-1 text-[22px] font-semibold leading-none text-[#4a3328]">
                            ${Number(listing.price).toLocaleString()}
                        </p>
                    )}

                    <Link href={`/${sellerSlug}`} className="mt-4 block rounded-[12px] border border-[#ddd3cb] bg-[#e8ddd1] px-[13px] py-[10px]">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#ddd3cb] bg-[#d2baa3] text-[16px] text-[#7a6050]" style={{ fontFamily: "var(--font-serif), serif" }}>
                                {sellerInitial}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-medium text-[#2f2925]">{sellerFullName}</p>
                                {sellerReviewCount > 0 ? (
                                    <div className="mt-1 flex items-center gap-1 text-[#c6ab6e]">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={`seller-rating-${star}`}
                                                className={`h-3.5 w-3.5 ${star <= Math.round(sellerRatingAverage) ? "fill-current" : "text-[#cfc7be]"}`}
                                            />
                                        ))}
                                        <span className="ml-1 text-[11px] text-[#8a7667]">
                                            {sellerRatingAverage} · {sellerReviewCount} review{sellerReviewCount === 1 ? "" : "s"}
                                        </span>
                                    </div>
                                ) : null}
                            </div>
                            <ChevronRight className="h-5 w-5 text-[#8a7667]" />
                        </div>
                    </Link>

                    <div className="mt-5 flex flex-wrap items-start gap-[10px] pb-[14px]">
                        {metaPills.map((pill) => (
                            <div
                                key={`${pill.label}-${pill.value}`}
                                className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-[14px] py-[10px] text-[12px] font-normal leading-none text-[#8a7667]"
                            >
                                {pill.label ? <span>{pill.label}:&nbsp;</span> : null}
                                <span className="font-semibold text-[#2f2925]">{pill.value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6">
                        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8a7667]">Description</h2>
                        <p className="mt-2 text-[13px] leading-[1.65] text-[#8a7667]">
                            {cleanDescription}
                        </p>
                    </div>

                    {measurements ? (
                        <div className="mt-6">
                            <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8a7667]">Measurements</h2>
                            <p className="mt-2 text-[13px] leading-[1.65] text-[#8a7667]">
                                {measurements}
                            </p>
                        </div>
                    ) : null}

                    <ListingComments listingId={listing.id} initialComments={comments} isAuthed={isAuthed} />
                    {similarListings.length > 0 ? (
                        <div className="mt-6">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8a7667]">Similar items</h2>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-4">
                                {similarListings.map((l) => (
                                    <FeaturedListingTile
                                        key={l.id}
                                        id={l.id}
                                        title={l.title}
                                        category={l.category}
                                        size={l.size}
                                        price={Number(l.price)}
                                        coverImage={recommendationImage(l)}
                                        isFavorited={favoriteListingIds.has(l.id)}
                                        effectivePrice={similarPrices.get(l.id) ?? null}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="fixed inset-x-0 bottom-[86px] z-[70] border-t border-[#ddd3cb] bg-[#fbf8f5]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#fbf8f5]/80 md:bottom-0">
                    <div className="mx-auto flex w-full max-w-[480px] items-center justify-between gap-2">
                        <FavoriteButton
                            listingId={listing.id}
                            initialFavorited={favoriteListingIds.has(listing.id)}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ddd3cb] bg-[#fbf8f5] text-[#2f2925]"
                            iconClassName="h-5 w-5"
                        />
                        {!isOwner ? (
                            <MessageSellerButton
                                listingId={listing.id}
                                sellerId={listing.user_id}
                                isAuthed={isAuthed}
                            />
                        ) : (
                            <Link
                                href={`/sell?edit=${listing.id}`}
                                aria-label="Edit listing"
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ddd3cb] bg-[#fbf8f5] text-[#2f2925]"
                            >
                                <Pencil className="h-5 w-5" />
                            </Link>
                        )}
                        <ShareListingButton
                            title={listing.title}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ddd3cb] bg-[#fbf8f5] text-[#2f2925]"
                            iconClassName="h-5 w-5"
                        />
                        {canMakeOffer && (
                            <MakeOfferButton
                                listingId={listing.id}
                                askingPrice={Number(listing.price)}
                                isAuthed={isAuthed}
                                existingOfferId={existingOfferId}
                            />
                        )}
                        {isAvailable && !isOwner ? (
                            <div className="ml-1 min-w-[120px] max-w-[170px] flex-1">
                                <AddToBagButton
                                    listingId={listing.id}
                                    isAuthed={isAuthed}
                                    price={Number(effectivePrice ?? listing.price)}
                                    addToCartAction={async () => {
                                        "use server";
                                        await addToCartAndRedirect(listing.id);
                                    }}
                                />
                            </div>
                        ) : (
                            <button
                                type="button"
                                disabled
                                className="inline-flex h-9 w-[170px] items-center justify-center rounded-full border border-[#cdbfb3] bg-[#cdbfb3] px-3 text-[12px] font-medium text-white whitespace-nowrap disabled:opacity-80"
                            >
                                {isOwner ? "Your listing" : "Sold Out"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
