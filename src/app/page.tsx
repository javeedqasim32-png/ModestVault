import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Heart, Search } from "lucide-react";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { resolveEditorialMediaUrl } from "@/lib/editorial-media";
import { prisma } from "@/lib/prisma";
import FavoriteButton from "@/components/marketplace/FavoriteButton";
import { getFavoriteListingIdsForSessionUser } from "@/app/actions/favorites";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getRecentlyViewedCookieName, parseRecentlyViewedCookie } from "@/lib/recently-viewed";
import { revalidatePath } from "next/cache";

const categories = [
  {
    name: "Everyday",
    accent: "from-[#ead5c7] to-[#f4ece5]",
    image: "/category-everyday-blend.png",
  },
  {
    name: "Festive Pret",
    accent: "from-[#d8beab] to-[#f0e3d8]",
    image: "/category-luxury-pret.png",
  },
  {
    name: "Formals",
    accent: "from-[#c5b4ab] to-[#efe3dd]",
    image: "/category-formal-wear.png",
  },
  {
    name: "Modest Wear",
    accent: "from-[#e6d9d1] to-[#f6efea]",
    image: "/category-abayas.png",
  },
  {
    name: "Bridals",
    accent: "from-[#d7b9a8] to-[#f3e6dd]",
    image: "/category-wedding.png",
  },
];

// Editorial media is intentionally decoupled from user listing uploads.
// Replace these placeholders with your provided branded assets later.
const HOME_EDITORIAL_MEDIA = {
  category: "/home-placeholders/editorial-placeholder.svg",
  hero: "/hero-elegance.jpg",
  trending: "/home-placeholders/editorial-placeholder.svg",
} as const;

const TRENDING_TAGS = [
  "#AbayaSzn",
  "#FestivePret",
  "#ModestBride",
  "#ShalwarKameez",
  "#EidLook",
  "#Kaftan",
] as const;

import { serializeListing } from "@/lib/serialization";

const cormorantHeading = localFont({
  src: [
    { path: "../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  display: "swap",
});

export default async function Home() {
  const session = await auth();
  const cookieStore = await cookies();
  const recentUserCookieName = getRecentlyViewedCookieName(session?.user?.id);
  const recentGuestCookieName = getRecentlyViewedCookieName(null);
  const recentUserIds = parseRecentlyViewedCookie(cookieStore.get(recentUserCookieName)?.value);
  const recentGuestIds = parseRecentlyViewedCookie(cookieStore.get(recentGuestCookieName)?.value);
  const recentViewedIds = Array.from(new Set([...recentUserIds, ...recentGuestIds]));

  const featuredListings = await prisma.listing.findMany({
    where: { status: "AVAILABLE", moderation_status: "APPROVED" },
    orderBy: { created_at: "desc" },
    take: 8,
    include: {
      images: {
        orderBy: { imageOrder: "asc" },
        take: 1,
        select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
      },
    },
  });

  let trendingListings: Awaited<ReturnType<typeof prisma.listing.findMany>> = [];
  try {
    trendingListings = await prisma.listing.findMany({
      where: { status: "AVAILABLE", moderation_status: "APPROVED" },
      orderBy: [{ view_count: "desc" }, { created_at: "desc" }],
      take: 3,
      include: {
        images: {
          orderBy: { imageOrder: "asc" },
          take: 1,
          select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
        },
      },
    });
  } catch {
    // Backward-safe fallback if runtime Prisma client/database does not yet have view_count.
    trendingListings = await prisma.listing.findMany({
      where: { status: "AVAILABLE", moderation_status: "APPROVED" },
      orderBy: { created_at: "desc" },
      take: 5,
      include: {
        images: {
          orderBy: { imageOrder: "asc" },
          take: 1,
          select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
        },
      },
    });
  }

  const topSellerStats = await prisma.listing.groupBy({
    by: ["user_id"],
    where: { moderation_status: "APPROVED" },
    _count: { _all: true },
    orderBy: { _count: { user_id: "desc" } },
    take: 5,
  });

  const topSellerIds = topSellerStats.map((item) => item.user_id);
  const topSellerUsers = topSellerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topSellerIds } },
        select: { id: true, first_name: true, last_name: true },
      })
    : [];

  const topSellerUserById = new Map(topSellerUsers.map((user) => [user.id, user]));
  const featuredSellers = topSellerStats
    .map((item) => {
      const user = topSellerUserById.get(item.user_id);
      if (!user) return null;
      const lastInitial = user.last_name?.[0] ? `${user.last_name[0].toUpperCase()}.` : "";
      const displayName = `${user.first_name} ${lastInitial}`.trim();
      const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "M";

      return {
        id: user.id,
        name: displayName,
        initials,
        soldCount: item._count._all,
      };
    })
    .filter((seller): seller is { id: string; name: string; initials: string; soldCount: number } => seller !== null);

  const recentlyViewedListings = recentViewedIds.length
    ? await prisma.listing.findMany({
        where: {
          id: { in: recentViewedIds },
          status: "AVAILABLE",
          moderation_status: "APPROVED",
        },
        include: {
          images: {
            orderBy: { imageOrder: "asc" },
            take: 1,
            select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
          },
        },
      })
    : [];

  const recentlyViewedById = new Map(recentlyViewedListings.map((listing) => [listing.id, listing]));
  const recentlyViewed = recentViewedIds
    .map((id) => recentlyViewedById.get(id))
    .filter((listing): listing is NonNullable<typeof listing> => Boolean(listing))
    .slice(0, 3)
    .map((listing) => ({
      ...serializeListing(listing),
      coverImage: getPrimaryListingImage(listing, "card"),
    }));

  const trending = trendingListings.map((listing) => ({
    ...serializeListing(listing),
    coverImage: getPrimaryListingImage(listing, "card"),
  }));
  const newIn = featuredListings.map((listing) => ({
    ...serializeListing(listing),
    coverImage: getPrimaryListingImage(listing, "card"),
  }));
  const favoriteListingIds = new Set(
    await getFavoriteListingIdsForSessionUser([
      ...trending.map((listing) => listing.id),
      ...newIn.map((listing) => listing.id)
    ])
  );

  async function clearRecentlyViewed() {
    "use server";
    const currentSession = await auth();
    const store = await cookies();
    const userCookie = getRecentlyViewedCookieName(currentSession?.user?.id);
    const guestCookie = getRecentlyViewedCookieName(null);

    store.set(userCookie, "", { path: "/", maxAge: 0, sameSite: "lax" });
    store.set(guestCookie, "", { path: "/", maxAge: 0, sameSite: "lax" });
    revalidatePath("/");
  }

  return (
    <div className="bg-[#EFE7DE] px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col overflow-hidden bg-[#EFE7DE] sm:rounded-[2rem] sm:border sm:border-border/80 sm:shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
        <section className="bg-transparent px-4 pb-6 pt-3 sm:border-b sm:border-border/80 sm:px-6 sm:py-6 lg:px-10">
          <div className="mb-6 flex flex-wrap items-center gap-3 lg:hidden">
            <div className="flex flex-1 items-center gap-3 rounded-full border border-border bg-white px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                aria-label="Search"
                placeholder="Search"
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3 md:grid-cols-5 lg:flex lg:flex-wrap lg:justify-center lg:gap-8 xl:justify-between xl:gap-6">
            {categories.map((category) => (
              <Link
                key={category.name}
                href={`/browse?styles=${encodeURIComponent(category.name)}`}
                className="group text-center lg:w-[152px] xl:w-[170px]"
              >
                {category.image && (
                  <div className="mx-auto mb-2 relative h-20 w-20 sm:h-28 sm:w-28 lg:h-36 lg:w-36">
                    <Image
                      src={category.image}
                      alt={category.name}
                      fill
                      className="object-contain mix-blend-multiply scale-[1.5] transition-transform duration-500 group-hover:scale-[1.55]"
                      sizes="144px"
                    />
                  </div>
                )}
                <p className="mx-auto max-w-[7ch] text-sm font-medium leading-tight text-foreground sm:max-w-[8ch] sm:text-base lg:max-w-[9ch]">{category.name}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="block lg:hidden">
          <Link href="/browse" className="relative block min-h-[220px] border-y border-[#e7ddd6] bg-[linear-gradient(180deg,#efe2d7_0%,#e7d7cb_100%)] sm:min-h-[340px] sm:border-y-0 sm:border-b sm:border-border/80">
            <Image
              src={HOME_EDITORIAL_MEDIA.hero}
              alt="Modaire editorial"
              fill
              className="object-cover object-top"
              sizes="(max-width: 1280px) 100vw, 40vw"
            />
          </Link>
        </section>

        <section className="hidden border-b border-border/80 px-10 py-10 lg:block xl:px-12 xl:py-12">
          <div className="grid items-stretch gap-8 lg:grid-cols-1">
            <Link href="/browse" className="group relative min-h-[560px] overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#efe2d7_0%,#e7d7cb_100%)]">
              <Image
                src={HOME_EDITORIAL_MEDIA.hero}
                alt="Modaire editorial"
                fill
                className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 1280px) 100vw, 80vw"
              />
            </Link>
          </div>
        </section>

        <section className="bg-transparent px-4 pt-4 pb-8 sm:border-t sm:border-border/80 sm:px-6 sm:pt-5 lg:px-10">
          <div className="flex items-baseline justify-between pb-[10px] pt-[8px]">
            <h2 className={`${cormorantHeading.className} -ml-[3px] text-[23px] font-medium leading-[1.05] text-foreground`}>
              Trending Now
            </h2>
            <Link href="/browse?sort=views" className="text-[12px] font-normal text-muted-foreground transition-colors hover:text-primary hover:underline">
              See all
            </Link>
          </div>

          {trending.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-border bg-background/60 px-8 py-16 text-center text-muted-foreground">
              No live listings yet. Once items are uploaded, this editorial grid will populate automatically.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[10px] pb-4 sm:grid-cols-4">
              {trending.map((listing) => (
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
                      sizes="(max-width: 640px) 33vw, (max-width: 1024px) 33vw, 25vw"
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

          {/* New In Section */}
          <div className="flex items-baseline justify-between pb-[10px] pt-[8px]">
            <h2 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-foreground`}>New In</h2>
            <Link href="/browse" className="text-[12px] font-normal text-muted-foreground transition-colors hover:text-primary hover:underline">
              See all
            </Link>
          </div>
          {newIn.length === 0 ? null : (
            <div className="grid grid-cols-2 gap-[10px] pb-4 sm:grid-cols-3 lg:grid-cols-4">
              {newIn.map((listing) => (
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

          {featuredSellers.length > 0 ? (
            <>
              <div className="pb-[10px] pt-[10px]">
                <h2 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-foreground`}>
                  Featured Sellers
                </h2>
              </div>

              <div className="scrollbar-hide -mx-1 flex gap-[10px] overflow-x-auto pb-2 px-1">
                {featuredSellers.map((seller) => (
                  <div
                    key={seller.id}
                    className="min-w-[146px] rounded-[22px] border border-[#d9cdc3] bg-[#f6f1ec] px-4 py-5 text-center sm:min-w-[170px]"
                  >
                    <div className="mx-auto mb-4 flex h-[84px] w-[84px] items-center justify-center rounded-full border-[5px] border-[#d9cdc3] bg-[#cdb79f] text-[34px] text-[#7b5f4f]">
                      <span className={cormorantHeading.className}>{seller.initials}</span>
                    </div>
                    <p className="truncate text-[22px] leading-tight text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>
                      {seller.name}
                    </p>
                    <p className="mt-2 text-[12px] text-[#8a7667]">
                      {seller.soldCount} {seller.soldCount === 1 ? "listing" : "listings"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="pt-3">
                <h2 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-foreground`}>
                  Trending
                </h2>
                <div className="mt-2 grid grid-cols-3 gap-[10px] px-[16px] pb-[14px] pt-[10px]">
                  {TRENDING_TAGS.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-[14px] py-[10px] text-[12px] font-normal leading-none text-[#8a7667]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-baseline justify-between pb-[10px] pt-[2px]">
                <h2 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-foreground`}>
                  Recently Viewed
                </h2>
                {recentlyViewed.length > 0 ? (
                  <form action={clearRecentlyViewed}>
                    <button
                      type="submit"
                      className="text-[12px] font-normal text-muted-foreground transition-colors hover:text-primary hover:underline"
                    >
                      Clear
                    </button>
                  </form>
                ) : null}
              </div>

              {recentlyViewed.length > 0 ? (
                <div className="flex gap-[10px] pb-4">
                  {recentlyViewed.map((listing) => (
                    <Link key={listing.id} href={`/listings/${listing.id}`} className="w-[102px] shrink-0">
                      <div className="relative mb-2 aspect-[3/4] overflow-hidden rounded-[16px] border border-[#ddd3cb] bg-[#faf8f6]">
                        <Image
                          src={listing.coverImage}
                          alt={listing.title}
                          fill
                          className="object-cover object-center"
                          sizes="110px"
                        />
                      </div>
                      <p className="line-clamp-2 text-center text-[12px] leading-[1.35] text-[#8a7667]">
                        {listing.title}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="hidden grid gap-6 border-t border-border/80 bg-[linear-gradient(180deg,#f8f3ef_0%,#f2eae5_100%)] px-6 py-8 lg:grid-cols-3 lg:px-10">
          {[
            ["Verified sellers", "Every seller flow still runs through your existing onboarding and payout setup."],
            ["Secure checkout", "The interface changed, not the Stripe-powered purchasing flow or backend routes."],
            ["One shared marketplace", "Listings, purchases, earnings, and dashboard data remain driven by the same Prisma models."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-[1.5rem] border border-border/70 bg-card/70 p-6">
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{title}</p>
              <p className="mt-4 text-base leading-7 text-foreground/80">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
