import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Pencil, Plus } from "lucide-react";
import ProfileAvatarUploader from "@/components/profile/ProfileAvatarUploader";
import { prisma } from "@/lib/prisma";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { serializeListing } from "@/lib/serialization";
import FavoriteButton from "@/components/marketplace/FavoriteButton";
import { getFavoriteListingIdsForSessionUser } from "@/app/actions/favorites";
import localFont from "next/font/local";
import SellerReviewsSection from "@/components/marketplace/SellerReviewsSection";
import { getSlugToUserMap } from "@/lib/user-slugs";
import { auth } from "@/auth";
import FollowButton from "@/components/marketplace/FollowButton";
import { getFollowCounts, checkIsFollowing } from "@/app/actions/follows";

export const dynamic = "force-dynamic";

const cormorantHeading = localFont({
  src: [
    { path: "../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  display: "swap",
});

function formatMemberSince(date: Date) {
  return `Member since ${date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
}

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

const sellerSelect = {
  id: true,
  first_name: true,
  last_name: true,
  profile_image: true,
  created_at: true,
  listings: {
    where: { moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] } },
    orderBy: { created_at: "desc" as const },
    include: {
      images: {
        orderBy: { imageOrder: "asc" as const },
        take: 1,
        select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
      },
    },
  },
  reviewsReceived: {
    orderBy: { created_at: "desc" as const },
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
};

export default async function SellerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const slugToUserMap = await getSlugToUserMap();
  const userId = slugToUserMap.get(id.toLowerCase()) || (uuidRegex.test(id) ? id : null);

  const seller = userId ? await prisma.user.findUnique({
    where: { id: userId },
    select: sellerSelect
  }) : null;

  if (!seller) notFound();

  const isOwnProfile = session?.user?.id === seller.id;

  const listings = seller.listings.map((listing) => ({
    ...serializeListing(listing),
    coverImage: getPrimaryListingImage(listing, "card"),
  }));
  // Split for the two profile sections. SOLD items stay clickable
  // (buyers use them as social proof / to see the seller's aesthetic),
  // just visually flagged with a badge on the tile.
  const activeListings = listings.filter((l) => l.status === "AVAILABLE");
  const soldListings = listings.filter((l) => l.status === "SOLD");

  const favoriteListingIds = new Set(await getFavoriteListingIdsForSessionUser(listings.map((listing) => listing.id)));
  const { followersCount } = await getFollowCounts(seller.id);
  const isFollowing = isOwnProfile ? false : await checkIsFollowing(seller.id);
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
            <ProfileAvatarUploader
              sellerId={seller.id}
              initials={sellerInitial}
              isOwnProfile={isOwnProfile}
              initialProfileImage={seller.profile_image}
            />
            <h1 className="text-[22px] leading-[1.1] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
              {sellerDisplayName}
            </h1>
            <p className="mt-1 text-[12px] text-[#8a7667]">{formatMemberSince(seller.created_at)}</p>

            <div className="mt-4 grid w-full max-w-[360px] grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-[17px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
                  {salesCount}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#8a7667]">Sales</p>
              </div>
              <div>
                <p className="text-[17px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
                  {followersCount}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#8a7667]">Followers</p>
              </div>
              <div>
                <p className="text-[17px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
                  {rating}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#8a7667]">Rating</p>
              </div>
            </div>

            <div className="mt-4 flex w-full justify-center gap-2">
              {!isOwnProfile ? (
                <Link
                  href={`/messages/start?sellerId=${seller.id}`}
                  className="inline-flex min-h-[42px] min-w-[150px] items-center justify-center gap-2 rounded-full border border-[#4a3328] bg-[#4a3328] px-6 text-[13px] font-medium text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  Message
                </Link>
              ) : (
                <Link
                  href="/sell?create=1"
                  className="inline-flex min-h-[42px] min-w-[150px] items-center justify-center gap-2 rounded-full border border-[#4a3328] bg-[#4a3328] px-6 text-[13px] font-medium text-white"
                >
                  <Plus className="h-4 w-4" />
                  Add listing
                </Link>
              )}
              {isOwnProfile ? (
                <Link
                  href="/sell?manage=1"
                  className="inline-flex min-h-[42px] min-w-[130px] items-center justify-center gap-2 rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-6 text-[13px] font-medium text-[#2f2925]"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Listings
                </Link>
              ) : (
                <FollowButton targetUserId={seller.id} initialIsFollowing={isFollowing} />
              )}
            </div>
          </div>
        </section>

        <section className="px-4 pb-6 pt-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-foreground`}>
              Available
            </h2>
            {activeListings.length > 0 ? (
              <span className="text-[11px] font-normal uppercase tracking-[0.14em] text-[#8a7667]">
                {activeListings.length} {activeListings.length === 1 ? "item" : "items"}
              </span>
            ) : null}
          </div>
          {activeListings.length === 0 ? (
            <div className="rounded-[14px] border border-[#ddd3cb] bg-[#f7f2ed] px-5 py-8 text-[13px] text-[#8a7667]">
              No live listings from this seller yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-[10px] pb-4 sm:grid-cols-3 lg:grid-cols-4">
              {activeListings.map((listing) => (
                <ProfileListingTile
                  key={listing.id}
                  listing={listing}
                  isSold={false}
                  isFavorited={favoriteListingIds.has(listing.id)}
                />
              ))}
            </div>
          )}
        </section>

        {soldListings.length > 0 ? (
          <section className="px-4 pb-6 pt-2">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-foreground`}>
                Sold
              </h2>
              <span className="text-[11px] font-normal uppercase tracking-[0.14em] text-[#8a7667]">
                {soldListings.length} {soldListings.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-[10px] pb-4 sm:grid-cols-3 lg:grid-cols-4">
              {soldListings.map((listing) => (
                <ProfileListingTile
                  key={listing.id}
                  listing={listing}
                  isSold={true}
                  isFavorited={favoriteListingIds.has(listing.id)}
                />
              ))}
            </div>
          </section>
        ) : null}

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

/**
 * Listing tile used in both the Available and Sold sections. When
 * `isSold`, the photo is desaturated + a SOLD badge overlays the tile
 * so a buyer can't mistake it for still-purchasable. The tile stays
 * clickable — buyers use sold pieces as social proof of the seller's
 * aesthetic + past inventory.
 */
type ProfileListingTileProps = {
    listing: {
        id: string;
        title: string;
        category: string;
        price: number;
        size: string | null;
        coverImage: string;
    };
    isSold: boolean;
    isFavorited: boolean;
};

function ProfileListingTile({ listing, isSold, isFavorited }: ProfileListingTileProps) {
    return (
        <Link
            href={`/listings/${listing.id}`}
            className="group relative flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-[#ece3dc] bg-white transition-transform duration-150 hover:-translate-y-0.5"
        >
            <div className="relative aspect-[3/4] w-full min-w-0 overflow-hidden bg-[#faf8f6]">
                <Image
                    src={listing.coverImage}
                    alt={listing.title}
                    fill
                    className={`object-cover object-center transition-transform duration-500 group-hover:scale-105 ${isSold ? "grayscale-[0.25] opacity-80" : ""}`}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
                {isSold ? (
                    <>
                        <div className="absolute inset-0 bg-black/10" />
                        <span className="absolute left-[6px] top-[6px] z-10 rounded-full bg-[#2f2925] px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.14em] text-white shadow-sm">
                            Sold
                        </span>
                    </>
                ) : null}
                {!isSold ? (
                    <div className="absolute right-[6px] top-[6px] z-10 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-white/90">
                        <div className="scale-[0.65]">
                            <FavoriteButton listingId={listing.id} initialFavorited={isFavorited} />
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="flex min-w-0 flex-col px-[10px] pb-[10px] pt-[8px]">
                <div className="mb-[2px] truncate text-[9px] uppercase tracking-[0.1em] text-[#8a7667]">
                    {listing.category}
                </div>
                <h3 className="mb-[2px] line-clamp-2 text-[12px] font-normal leading-[1.3] text-[#2f2925]" title={listing.title}>
                    {listing.title}
                </h3>
                <div className="mt-auto flex items-end justify-between gap-2">
                    <p className={`truncate text-[13px] font-semibold ${isSold ? "text-[#8a7667] line-through" : "text-[#2f2925]"}`}>
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
    );
}
