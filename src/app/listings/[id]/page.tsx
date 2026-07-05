import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { addToCartAndRedirect } from "@/app/actions/cart";
import { getFavoriteListingIdsForSessionUser } from "@/app/actions/favorites";
import { getOrderedListingGallery } from "@/lib/listing-images";
import { getEffectivePriceForListing } from "@/lib/promotions/get-effective-price";
import { Pencil, Star, ChevronRight } from "lucide-react";
import Link from "next/link";
import RecentlyViewedTracker from "@/components/marketplace/RecentlyViewedTracker";
import FavoriteButton from "@/components/marketplace/FavoriteButton";
import ListingImageGallery from "@/components/marketplace/ListingImageGallery";
import ShareListingButton from "@/components/marketplace/ShareListingButton";
import SmartBackButton from "@/components/layout/SmartBackButton";
import AddToBagButton from "@/components/listings/AddToBagButton";
import MessageSellerButton from "@/components/listings/MessageSellerButton";

import { getUserSlugMap } from "@/lib/user-slugs";

export const dynamic = "force-dynamic";

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
    const favoriteListingIds = new Set(await getFavoriteListingIdsForSessionUser([listing.id]));
    const sellerFullName = `${listing.user.first_name} ${listing.user.last_name}`.trim();
    const slugMap = await getUserSlugMap();
    const sellerSlug = slugMap.get(listing.user_id) || listing.user_id;
    const sellerInitial = (listing.user.first_name?.[0] || "M").toUpperCase();
    const sellerReviewCount = listing.user.reviewsReceived.length;
    const sellerRatingAverage = sellerReviewCount
        ? Number((listing.user.reviewsReceived.reduce((sum, review) => sum + review.rating, 0) / sellerReviewCount).toFixed(1))
        : 0;
    const sellerReviews = listing.user.reviewsReceived.slice(0, 5);
    const { description: cleanDescription, measurements } = splitDescriptionAndMeasurements(listing.description || "");
    // Server-side promo lookup — never trust the client for pricing. Same
    // helper the checkout action uses, so what you see here is what you pay.
    const effectivePrice = await getEffectivePriceForListing(listing.id);
    const hasPromo = effectivePrice.discountPercent > 0;
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
            <RecentlyViewedTracker listingId={listing.id} viewerId={session?.user?.id ?? null} />
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

                    {sellerReviews.length > 0 ? (
                        <div className="mt-6">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8a7667]">Reviews</h2>
                                {sellerReviewCount > sellerReviews.length ? (
                                    <Link
                                        href={`/${sellerSlug}#reviews`}
                                        className="text-[12px] font-medium text-[#8a7667] hover:text-[#2f2925]"
                                    >
                                        View all {sellerReviewCount}
                                    </Link>
                                ) : null}
                            </div>
                            <div className="mt-3 space-y-3">
                                {sellerReviews.map((review) => {
                                    const reviewerName = `${review.reviewer.first_name} ${review.reviewer.last_name?.[0] ? `${review.reviewer.last_name[0].toUpperCase()}.` : ""}`.trim();
                                    const reviewerInitial = (review.reviewer.first_name?.[0] || "A").toUpperCase();
                                    const dateLabel = review.created_at.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                                    return (
                                        <div key={review.id} className="rounded-[12px] border border-[#ddd3cb] bg-[#fbf8f5] p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd3cb] bg-[#efe7de] text-[18px] font-semibold text-[#8a7667]">
                                                        {reviewerInitial}
                                                    </div>
                                                    <div>
                                                        <p className="text-[15px] font-semibold text-[#2f2925]">{reviewerName}</p>
                                                        <div className="mt-0.5 flex items-center gap-0.5 text-[#2f2925]">
                                                            {[1, 2, 3, 4, 5].map((star) => (
                                                                <Star
                                                                    key={`${review.id}-star-${star}`}
                                                                    className={`h-4 w-4 ${star <= review.rating ? "fill-current" : "text-[#cfc7be]"}`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-[12px] text-[#8a7667]">{dateLabel}</span>
                                            </div>
                                            <p className="mt-3 text-[13px] leading-[1.55] text-[#8a7667]">
                                                {review.text}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="fixed inset-x-0 bottom-[86px] z-[70] border-t border-[#ddd3cb] bg-[#fbf8f5]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#fbf8f5]/80 md:bottom-0">
                    <div className="mx-auto flex w-full max-w-[480px] items-center justify-between gap-4">
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
                        {isAvailable && !isOwner ? (
                            <div className="w-[170px]">
                                <AddToBagButton
                                    listingId={listing.id}
                                    isAuthed={isAuthed}
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
