import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import localFont from "next/font/local";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeListing } from "@/lib/serialization";
import { getPrimaryListingImage } from "@/lib/listing-images";
import FavoriteButton from "@/components/marketplace/FavoriteButton";

export const dynamic = "force-dynamic";

const cormorantHeading = localFont({
  src: [
    { path: "../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  display: "swap",
});

export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/favorites");
  }

  const favoriteDelegate = (prisma as unknown as {
    favoriteItem?: {
      findMany: (args: unknown) => Promise<
        Array<{
          listing: {
            id: string;
            title: string;
            description: string;
            price: unknown;
            category: string | null;
            condition: string | null;
            status: string;
            moderation_status: string;
            images: Array<{
              imageUrl: string;
              thumbUrl: string | null;
              mediumUrl: string | null;
              imageOrder: number;
            }>;
          };
        }>
      >;
    };
  }).favoriteItem;

  if (!favoriteDelegate) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] border border-border/80 bg-card p-10 text-center text-muted-foreground">
          Favorites are not available yet in this environment.
        </div>
      </div>
    );
  }

  const favorites = await favoriteDelegate.findMany({
    where: {
      user_id: session.user.id,
      listing: {
        status: "AVAILABLE",
        moderation_status: "APPROVED",
      },
    },
    orderBy: { created_at: "desc" },
    include: {
      listing: {
        include: {
          images: {
            orderBy: { imageOrder: "asc" },
            take: 1,
            select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
          },
        },
      },
    },
  });

  const favoriteListings = favorites.map((item) => ({
    ...serializeListing(item.listing),
    coverImage: getPrimaryListingImage(item.listing, "card"),
  }));

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1360px]">
        <div className="mb-5">
          <h1 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-foreground`}>Favorites</h1>
        </div>

        {favoriteListings.length === 0 ? (
          <div className="rounded-[1.45rem] border border-dashed border-border bg-[#fbf8f5] px-6 py-12 text-center">
            <h2 className="font-serif text-3xl text-foreground">No favorites yet</h2>
            <p className="mt-3 text-muted-foreground">Tap hearts on listings to save them here.</p>
            <Link href="/browse" className="mt-5 inline-block rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground">
              Explore listings
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {favoriteListings.map((listing) => (
              <article key={listing.id} className="rounded-[1.45rem] border border-[#ddd3cb] bg-[#fbf8f5] p-3.5">
                <div className="grid grid-cols-[96px_1fr] gap-3">
                  <Link href={`/listings/${listing.id}`} className="col-span-1">
                    <div className="relative overflow-hidden rounded-[1.05rem] border border-[#e3d8cf] bg-[#f2ebe4]">
                      <div className="relative aspect-[2/3]">
                        <Image src={listing.coverImage} alt={listing.title} fill className="object-cover" sizes="110px" />
                      </div>
                    </div>
                  </Link>

                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/listings/${listing.id}`} className="block min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-[1.04rem] leading-[1.2] font-semibold text-[#2f2925]">{listing.title}</h3>
                        <p className="mt-1 truncate text-[0.8rem] text-[#8a7667]">
                          {listing.category || "Fashion"}
                          {listing.type ? ` · ${listing.type}` : ""}
                          {listing.size ? ` · Size ${listing.size}` : ""}
                          {listing.brand ? ` · ${listing.brand}` : ""}
                        </p>
                        <p className="mt-1.5 text-[0.98rem] leading-none font-semibold text-[#2f2925]">
                          ${Number(listing.price).toLocaleString()}
                        </p>
                      </Link>
                      <FavoriteButton listingId={listing.id} initialFavorited />
                    </div>

                    <div className="mt-2.5 flex items-center gap-2.5">
                      <Link
                        href={`/listings/${listing.id}`}
                        className="inline-flex h-8 items-center rounded-full border border-[#d7cdc4] bg-white px-3.5 text-[0.84rem] font-medium text-[#5f4a3c]"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
