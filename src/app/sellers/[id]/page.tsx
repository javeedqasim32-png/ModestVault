import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { serializeListing } from "@/lib/serialization";
import FavoriteButton from "@/components/marketplace/FavoriteButton";
import { getFavoriteListingIdsForSessionUser } from "@/app/actions/favorites";
import localFont from "next/font/local";
import SellerReviewsSection from "@/components/marketplace/SellerReviewsSection";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const cormorantHeading = localFont({
  src: [
    { path: "../../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  display: "swap",
});

function formatMemberSince(date: Date) {
  return `Member since ${date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
}

export default async function SellerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const seller = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      created_at: true,
      listings: {
        where: { moderation_status: "APPROVED" },
        orderBy: { created_at: "desc" },
        include: {
          images: {
            orderBy: { imageOrder: "asc" },
            take: 1,
            select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
          },
        },
      },
      reviewsReceived: {
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          seller_id: true,
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
    },
  });

  if (!seller) notFound();

  const listings = seller.listings.map((listing) => ({
    ...serializeListing(listing),
    coverImage: getPrimaryListingImage(listing, "card"),
  }));

  const favoriteListingIds = new Set(await getFavoriteListingIdsForSessionUser(listings.map((listing) => listing.id)));
  const listingsCount = listings.length;
  const salesCount = seller.listings.filter((listing) => listing.status === "SOLD").length;
  const rating = seller.reviewsReceived.length
    ? Number((seller.reviewsReceived.reduce((sum, review) => sum + review.rating, 0) / seller.reviewsReceived.length).toFixed(1))
    : 0;
  const sellerDisplayName = `${seller.first_name} ${seller.last_name?.[0] ? `${seller.last_name[0].toUpperCase()}.` : ""}`.trim();
  const sellerInitial = (seller.first_name?.[0] || "M").toUpperCase();
  const initialReviews = seller.reviewsReceived.map((review) => ({
    id: review.id,
    sellerId: review.seller_id,
    reviewerName: `${review.reviewer.first_name} ${review.reviewer.last_name?.[0] ? `${review.reviewer.last_name[0].toUpperCase()}.` : ""}`.trim(),
    rating: review.rating,
    text: review.text,
    dateLabel: review.created_at.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
  }));

  return (
    <div className="min-h-screen bg-[#EFE7DE] pb-24">
      <div className="mx-auto w-full max-w-[820px]">
        <section className="border-y border-[#ddd3cb] bg-[#ece5dc] px-4 py-6">
          <div className="mx-auto flex w-full max-w-[520px] flex-col items-center text-center">
            <div
              className="mb-3 flex h-[68px] w-[68px] min-h-[68px] min-w-[68px] items-center justify-center rounded-full border-[3px] border-[#ddd3cb] bg-[#cfb79f] text-[26px] text-[#7a6050]"
              style={{ fontFamily: "var(--font-serif), serif" }}
            >
              {sellerInitial}
            </div>
            <h1 className="text-[22px] leading-[1.1] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
              {sellerDisplayName}
            </h1>
            <p className="mt-1 text-[12px] text-[#8a7667]">{formatMemberSince(seller.created_at)}</p>

            <div className="mt-4 grid w-full max-w-[360px] grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-[17px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
                  {listingsCount}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#8a7667]">Listings</p>
              </div>
              <div>
                <p className="text-[17px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
                  {salesCount}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#8a7667]">Sales</p>
              </div>
              <div>
                <p className="text-[17px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
                  {rating}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#8a7667]">Rating</p>
              </div>
            </div>

            <div className="mt-4 flex w-full justify-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-[42px] min-w-[150px] items-center justify-center gap-2 rounded-full border border-[#4a3328] bg-[#4a3328] px-6 text-[13px] font-medium text-white"
              >
                <MessageCircle className="h-4 w-4" />
                Message
              </button>
              <button
                type="button"
                className="inline-flex min-h-[42px] min-w-[130px] items-center justify-center rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-6 text-[13px] font-medium text-[#2f2925]"
              >
                Follow
              </button>
            </div>
          </div>
        </section>

        <section className="px-4 pb-6 pt-5">
          <h2 className={`${cormorantHeading.className} mb-3 text-[23px] font-medium leading-[1.05] text-foreground`}>
            Listings
          </h2>
          {listings.length === 0 ? (
            <div className="rounded-[14px] border border-[#ddd3cb] bg-[#f7f2ed] px-5 py-8 text-[13px] text-[#8a7667]">
              No live listings from this seller yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-[10px] pb-4 sm:grid-cols-3 lg:grid-cols-4">
              {listings.map((listing) => (
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
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
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
                    <p className="mt-[1px] truncate text-[13px] font-semibold text-[#2f2925]">
                      ${Number(listing.price).toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div id="reviews">
          <SellerReviewsSection
            sellerId={seller.id}
            sellerName={sellerDisplayName}
            initialReviews={initialReviews}
            canWrite={Boolean(session?.user?.id)}
          />
        </div>
      </div>
    </div>
  );
}
