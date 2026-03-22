import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeListing } from "@/lib/serialization";
import { getPrimaryListingImage } from "@/lib/listing-images";
import ListingCard from "@/components/marketplace/ListingCard";

export const dynamic = "force-dynamic";

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
      <div className="mx-auto max-w-[1360px] rounded-[2rem] border border-border/80 bg-card p-6 shadow-[0_35px_80px_rgba(114,86,67,0.10)] sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Saved</p>
            <h1 className="mt-2 font-serif text-4xl text-foreground">Your Heart List</h1>
          </div>
          <Heart className="h-6 w-6 text-foreground" />
        </div>

        {favoriteListings.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border bg-background/60 px-8 py-16 text-center">
            <h2 className="font-serif text-3xl text-foreground">No favorites yet</h2>
            <p className="mt-3 text-muted-foreground">Tap hearts on listings to save them here.</p>
            <Link href="/browse" className="mt-5 inline-block rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground">
              Explore listings
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {favoriteListings.map((listing) => (
              <ListingCard
                key={listing.id}
                href={`/listings/${listing.id}`}
                imageUrl={listing.coverImage}
                title={listing.title}
                description={listing.description}
                price={Number(listing.price)}
                category={listing.category}
                condition={listing.condition}
                showFullImage
                listingId={listing.id}
                isFavorited
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
