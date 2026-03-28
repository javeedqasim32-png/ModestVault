import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { addToCartAndRedirect } from "@/app/actions/cart";
import { getOrderedListingGallery, getPrimaryListingImage } from "@/lib/listing-images";
import { Heart, MessageCircle, ShoppingBag, Star, ChevronRight, ChevronLeft } from "lucide-react";
import Link from "next/link";
import RecentlyViewedTracker from "@/components/marketplace/RecentlyViewedTracker";

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
    const sellerFullName = `${listing.user.first_name} ${listing.user.last_name}`.trim();
    const sellerInitial = (listing.user.first_name?.[0] || "M").toUpperCase();
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

                    <div className="mt-4 rounded-[12px] border border-[#ddd3cb] bg-[#e8ddd1] px-[13px] py-[10px]">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#ddd3cb] bg-[#d2baa3] text-[16px] text-[#7a6050]" style={{ fontFamily: "var(--font-serif), serif" }}>
                                {sellerInitial}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-medium text-[#2f2925]">{sellerFullName}</p>
                                <div className="mt-1 flex items-center gap-1 text-[#c6ab6e]">
                                    <Star className="h-3.5 w-3.5 fill-current" />
                                    <Star className="h-3.5 w-3.5 fill-current" />
                                    <Star className="h-3.5 w-3.5 fill-current" />
                                    <Star className="h-3.5 w-3.5 fill-current" />
                                    <Star className="h-3.5 w-3.5 text-[#cfc7be]" />
                                    <span className="ml-1 text-[11px] text-[#8a7667]">4.8 · 16 reviews</span>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-[#8a7667]" />
                        </div>
                    </div>

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

                    <div className="mt-6">
                        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8a7667]">Reviews</h2>
                        <div className="mt-3 rounded-[12px] border border-[#ddd3cb] bg-[#fbf8f5] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd3cb] bg-[#efe7de] text-[18px] font-semibold text-[#8a7667]">A</div>
                                    <div>
                                        <p className="text-[15px] font-semibold text-[#2f2925]">Anonymous Buyer</p>
                                        <div className="mt-0.5 flex items-center gap-0.5 text-[#2f2925]">
                                            <Star className="h-4 w-4 fill-current" />
                                            <Star className="h-4 w-4 fill-current" />
                                            <Star className="h-4 w-4 fill-current" />
                                            <Star className="h-4 w-4 fill-current" />
                                            <Star className="h-4 w-4 fill-current" />
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[12px] text-[#8a7667]">Recent</span>
                            </div>
                            <p className="mt-3 text-[13px] leading-[1.55] text-[#8a7667]">
                                Beautiful piece and fast delivery.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="fixed inset-x-0 bottom-[78px] z-50 border-t border-[#ddd3cb] bg-[#fbf8f5]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#fbf8f5]/80 md:bottom-0">
                    <div className="mx-auto flex w-full max-w-[820px] gap-2">
                        <button
                            type="button"
                            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-4 text-[13px] text-[#2f2925]"
                        >
                            <Heart className="h-4 w-4" />
                            Save
                        </button>
                        <button
                            type="button"
                            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-4 text-[13px] text-[#2f2925]"
                        >
                            <MessageCircle className="h-4 w-4" />
                            Message
                        </button>
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
