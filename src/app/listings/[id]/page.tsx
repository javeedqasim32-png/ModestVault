import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { addToCartAndRedirect } from "@/app/actions/cart";
import { getFavoriteListingIdsForSessionUser } from "@/app/actions/favorites";
import { getOrderedListingGallery, getPrimaryListingImage } from "@/lib/listing-images";
import { MessageCircle, ShoppingBag, Star, ChevronRight, ChevronLeft } from "lucide-react";
import Link from "next/link";
import RecentlyViewedTracker from "@/components/marketplace/RecentlyViewedTracker";
import FavoriteButton from "@/components/marketplace/FavoriteButton";

export const dynamic = "force-dynamic";

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
    const isAvailable = listing.status === "AVAILABLE";
    const orderedImages = getOrderedListingGallery(listing);
    const primaryImage = getPrimaryListingImage(listing, "detail");
    const favoriteListingIds = new Set(await getFavoriteListingIdsForSessionUser([listing.id]));
    const sellerFullName = `${listing.user.first_name} ${listing.user.last_name}`.trim();
    const sellerInitial = (listing.user.first_name?.[0] || "M").toUpperCase();
    const sellerReviewCount = listing.user.reviewsReceived.length;
    const sellerRatingAverage = sellerReviewCount
        ? Number((listing.user.reviewsReceived.reduce((sum, review) => sum + review.rating, 0) / sellerReviewCount).toFixed(1))
        : 0;
    const sellerReviews = listing.user.reviewsReceived.slice(0, 5);
    const metaPills = [
        { label: "Size", value: listing.size || "M" },
        { label: "Condition", value: listing.condition || "Like new" },
        { label: "Category", value: listing.category || "Suits" },
        { label: listing.subcategory ? "" : "Type", value: listing.subcategory || listing.type || "Lehenga" },
        { label: "Brand", value: listing.brand || `${listing.user.first_name} Couture` },
    ];

    return (
        <div className="min-h-screen bg-[#EFE7DE]">
            <RecentlyViewedTracker listingId={listing.id} viewerId={session?.user?.id ?? null} />
            <div className="mx-auto w-full max-w-[820px] pb-36">
                <div className="px-4 pb-3 pt-4">
                    <Link href="/browse" className="inline-flex items-center gap-1 text-[12px] text-[#8a7667] hover:text-[#2f2925]">
                        <ChevronLeft className="h-4 w-4" />
                        Back
                    </Link>
                </div>

                <div className="space-y-2 px-4">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-[18px] border border-[#ddd3cb] bg-[#faf8f6]">
                        <Image
                            src={primaryImage}
                            alt={listing.title}
                            fill
                            className="object-cover"
                            priority
                        />
                        {listing.status === "SOLD" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                                <span className="text-2xl font-semibold uppercase tracking-widest text-white">
                                    Sold
                                </span>
                            </div>
                        )}
                    </div>
                    {orderedImages.length > 1 ? (
                        <div className="grid grid-cols-5 gap-2">
                            {orderedImages.map((image, index) => (
                                <div
                                    key={`${listing.id}-${index}`}
                                    className="relative aspect-[3/4] overflow-hidden rounded-[10px] border border-[#ddd3cb] bg-[#faf8f6]"
                                >
                                    <Image
                                        src={image.thumbUrl || image.mediumUrl || image.originalUrl}
                                        alt={`${listing.title} view ${index + 1}`}
                                        fill
                                        className="object-cover"
                                        sizes="20vw"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div className="mt-1 px-4 pt-2">
                    <h1
                        className="text-[24px] leading-[1.2] text-[#2f2925]"
                        style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}
                    >
                        {listing.title}
                    </h1>
                    <p className="mt-1 text-[22px] font-semibold leading-none text-[#4a3328]">
                        ${Number(listing.price).toLocaleString()}
                    </p>

                    <Link href={`/sellers/${listing.user_id}`} className="mt-4 block rounded-[12px] border border-[#ddd3cb] bg-[#e8ddd1] px-[13px] py-[10px]">
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
                                {pill.label ? <span>{pill.label}: </span> : null}
                                <span className="font-semibold text-[#2f2925]">{pill.value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6">
                        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8a7667]">Description</h2>
                        <p className="mt-2 text-[13px] leading-[1.65] text-[#8a7667]">
                            {listing.description}
                        </p>
                    </div>

                    {sellerReviews.length > 0 ? (
                        <div className="mt-6">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8a7667]">Reviews</h2>
                                {sellerReviewCount > sellerReviews.length ? (
                                    <Link
                                        href={`/sellers/${listing.user_id}#reviews`}
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
                    <div className="mx-auto flex w-full max-w-[820px] gap-2">
                        <FavoriteButton
                            listingId={listing.id}
                            initialFavorited={favoriteListingIds.has(listing.id)}
                            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-4 text-[13px] text-[#2f2925]"
                            iconClassName="h-4 w-4"
                            label="Save"
                            labelClassName="text-[13px]"
                        />
                        <Link
                            href={`/messages/start?sellerId=${listing.user_id}&listingId=${listing.id}`}
                            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-4 text-[13px] text-[#2f2925]"
                        >
                            <MessageCircle className="h-4 w-4" />
                            Message
                        </Link>
                        {isAvailable && !isOwner ? (
                            <form
                                action={async () => {
                                    "use server";
                                    await addToCartAndRedirect(listing.id);
                                }}
                                className="flex-1"
                            >
                                <button
                                    type="submit"
                                    className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full border border-[#a07c61] bg-[#a07c61] px-4 text-[13px] font-medium text-white"
                                >
                                    <ShoppingBag className="h-4 w-4" />
                                    Add to Bag
                                </button>
                            </form>
                        ) : (
                            <button
                                type="button"
                                disabled
                                className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-full border border-[#cdbfb3] bg-[#cdbfb3] px-4 text-[13px] font-medium text-white disabled:opacity-80"
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
