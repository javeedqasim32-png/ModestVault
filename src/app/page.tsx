import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Heart, Search } from "lucide-react";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { resolveEditorialMediaUrl } from "@/lib/editorial-media";
import { prisma } from "@/lib/prisma";

const categories = [
  {
    name: "Everyday Modest",
    accent: "from-[#ead5c7] to-[#f4ece5]",
    image: resolveEditorialMediaUrl(
      "editorial/home/everyday-modest.jpg",
      "/home-placeholders/editorial-placeholder.svg"
    ),
  },
  {
    name: "Luxury Pret",
    accent: "from-[#d8beab] to-[#f0e3d8]",
    image: resolveEditorialMediaUrl(
      "editorial/home/luxury-pret.jpg",
      "/home-placeholders/editorial-placeholder.svg"
    ),
  },
  {
    name: "Formal Wear",
    accent: "from-[#c5b4ab] to-[#efe3dd]",
    image: resolveEditorialMediaUrl(
      "editorial/home/formal-wear.jpg",
      "/home-placeholders/editorial-placeholder.svg"
    ),
  },
  {
    name: "Abayas",
    accent: "from-[#e6d9d1] to-[#f6efea]",
    image: resolveEditorialMediaUrl(
      "editorial/home/abayas.jpg",
      "/home-placeholders/editorial-placeholder.svg"
    ),
  },
  {
    name: "Wedding",
    accent: "from-[#d7b9a8] to-[#f3e6dd]",
    image: resolveEditorialMediaUrl(
      "editorial/home/wedding.jpg",
      "/home-placeholders/editorial-placeholder.svg"
    ),
  },
];

// Editorial media is intentionally decoupled from user listing uploads.
// Replace these placeholders with your provided branded assets later.
const HOME_EDITORIAL_MEDIA = {
  category: "/home-placeholders/editorial-placeholder.svg",
  hero: resolveEditorialMediaUrl(
    "editorial/home/hero-elevate-style-v2.png",
    "/home-placeholders/editorial-placeholder.svg"
  ),
  trending: "/home-placeholders/editorial-placeholder.svg",
} as const;

export default async function Home() {
  const featured = await prisma.listing.findMany({
    where: { status: "AVAILABLE" },
    orderBy: { created_at: "desc" },
    take: 5,
  });

  let trendingListings: Awaited<ReturnType<typeof prisma.listing.findMany>> = [];
  try {
    trendingListings = await prisma.listing.findMany({
      where: { status: "AVAILABLE" },
      orderBy: [{ view_count: "desc" }, { created_at: "desc" }],
      take: 5,
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
      where: { status: "AVAILABLE" },
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

  const heroListing = featured[0] ?? null;
  const trending = trendingListings.map((listing) => ({
    ...listing,
    coverImage: getPrimaryListingImage(listing, "card"),
  }));

  return (
    <div className="bg-[#f4efea] px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col overflow-hidden bg-[#fcfaf7] sm:rounded-[2rem] sm:border sm:border-border/80 sm:shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
        <section className="bg-[#fcfaf7] px-4 pb-6 pt-3 sm:border-b sm:border-border/80 sm:px-6 sm:py-6 lg:px-10">
          <div className="mb-6 flex flex-wrap items-center gap-3 lg:hidden">
            <div className="flex flex-1 items-center gap-3 rounded-full border border-border bg-white px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                aria-label="Search"
                placeholder="Search designers, abayas, pret..."
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3 md:grid-cols-5 lg:flex lg:flex-wrap lg:justify-center lg:gap-8 xl:justify-between xl:gap-6">
            {categories.map((category, index) => (
              <Link key={category.name} href="/browse" className="group text-center lg:w-[152px] xl:w-[170px]">
                <div className={`mx-auto mb-3 flex h-20 w-20 items-end justify-center overflow-hidden rounded-full bg-gradient-to-b ${category.accent} p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:h-28 sm:w-28 sm:p-3 lg:h-36 lg:w-36 lg:p-4`}>
                  <div className="relative h-full w-full overflow-hidden rounded-full">
                    <Image
                      src={category.image ?? HOME_EDITORIAL_MEDIA.category}
                      alt={category.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="128px"
                    />
                  </div>
                </div>
                <p className="mx-auto max-w-[7ch] text-sm font-medium leading-tight text-foreground sm:max-w-[8ch] sm:text-base lg:max-w-[9ch]">{category.name}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="block lg:hidden">
          <div className="relative min-h-[220px] border-y border-[#e7ddd6] bg-[linear-gradient(180deg,#efe2d7_0%,#e7d7cb_100%)] sm:min-h-[340px] sm:border-y-0 sm:border-b sm:border-border/80">
            <Image
              src={HOME_EDITORIAL_MEDIA.hero}
              alt="Modest Vault editorial"
              fill
              className="object-cover object-top"
              sizes="(max-width: 1280px) 100vw, 40vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#f1e4d9]/92 via-[#f1e4d9]/28 to-transparent" />
            <div className="absolute left-6 top-1/2 max-w-[13rem] -translate-y-1/2 sm:left-8 sm:max-w-sm sm:rounded-[1.75rem] sm:border sm:border-white/50 sm:bg-white/48 sm:p-6 sm:backdrop-blur-sm">
              <Link href="/browse" className="mt-5 inline-flex items-center gap-2 text-base text-foreground sm:text-lg">
                Shop Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="hidden border-b border-border/80 px-10 py-10 lg:block xl:px-12 xl:py-12">
          <div className="grid items-stretch gap-8 lg:grid-cols-1">
            <Link href="/browse" className="group relative min-h-[560px] overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#efe2d7_0%,#e7d7cb_100%)]">
              <Image
                src={HOME_EDITORIAL_MEDIA.hero}
                alt="Modest Vault editorial"
                fill
                className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 1280px) 50vw, 42vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#f1e4d9]/88 via-transparent to-transparent" />
              <div className="absolute left-10 top-12 max-w-[18rem]">
                <p className="mt-6 inline-flex items-center gap-2 text-2xl text-foreground">
                  Shop Now
                  <ArrowRight className="h-5 w-5" />
                </p>
              </div>
            </Link>
          </div>
        </section>

        <section className="bg-[#fcfaf7] px-4 py-8 sm:border-t sm:border-border/80 sm:px-6 lg:px-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-serif text-[2.1rem] leading-none text-foreground sm:text-4xl">Trending Now</h2>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <Heart className="h-4 w-4" />
              Save the styles you love
            </div>
          </div>

          {trending.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-border bg-background/60 px-8 py-16 text-center text-muted-foreground">
              No live listings yet. Once items are uploaded, this editorial grid will populate automatically.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
              {trending.map((listing, index) => (
                <Link
                  key={listing.id}
                  href={`/listings/${listing.id}`}
                  className={`group overflow-hidden rounded-[1.2rem] border border-[#ece3dc] bg-white ${index === 0 ? "col-span-2 lg:col-span-1" : ""}`}
                >
                  <div className={`grid h-full ${index === 0 ? "sm:grid-cols-[0.95fr_1.05fr] lg:grid-cols-1" : ""}`}>
                    <div className="relative min-h-[210px] bg-muted sm:min-h-[280px] lg:min-h-[360px]">
                      <Image
                        src={listing.coverImage}
                        alt={listing.title}
                        fill
                        className="object-contain bg-card/60 p-1 transition-transform duration-700 group-hover:scale-105"
                        sizes="(max-width: 1024px) 100vw, 30vw"
                      />
                    </div>
                    <div className="flex flex-col justify-between p-3 sm:p-6">
                      <div>
                        <div className="mb-3 flex items-center justify-between text-muted-foreground">
                          <span className="text-[10px] uppercase tracking-[0.24em]">{listing.category}</span>
                          <Heart className="h-5 w-5" />
                        </div>
                        <h3 className="font-serif text-xl leading-tight text-foreground sm:text-3xl lg:text-[2rem]">
                          {listing.title}
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground sm:mt-3 sm:line-clamp-3">
                          {listing.description}
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between sm:mt-6">
                        <p className="text-xl font-medium text-foreground sm:text-2xl">${Number(listing.price).toLocaleString()}</p>
                        <span className="hidden items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-foreground sm:inline-flex">
                          View
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
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
