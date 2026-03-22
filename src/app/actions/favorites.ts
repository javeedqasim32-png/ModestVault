"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function getFavoriteDelegate() {
  return (prisma as unknown as {
    favoriteItem?: {
      count: (args: unknown) => Promise<number>;
      upsert: (args: unknown) => Promise<unknown>;
      deleteMany: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<Array<{ listing_id: string }>>;
    };
  }).favoriteItem;
}

export async function getFavoriteCountForSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return 0;
  const favoriteItem = getFavoriteDelegate();
  if (!favoriteItem) return 0;

  try {
    return await favoriteItem.count({
      where: { user_id: session.user.id },
    });
  } catch (error) {
    console.error("getFavoriteCountForSessionUser error:", error);
    return 0;
  }
}

export async function getFavoriteListingIdsForSessionUser(listingIds: string[]) {
  const session = await auth();
  if (!session?.user?.id || listingIds.length === 0) return [];

  const favoriteItem = getFavoriteDelegate();
  if (!favoriteItem) return [];

  try {
    const rows = await favoriteItem.findMany({
      where: {
        user_id: session.user.id,
        listing_id: { in: listingIds },
      },
      select: { listing_id: true },
    });
    return rows.map((row) => row.listing_id);
  } catch (error) {
    console.error("getFavoriteListingIdsForSessionUser error:", error);
    return [];
  }
}

export async function setFavoriteForListing(listingId: string, shouldFavorite: boolean) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Please sign in to save favorites." };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, user_id: true },
  });

  if (!listing) return { error: "Listing not found." };
  if (listing.user_id === session.user.id) {
    return { error: "You cannot favorite your own listing." };
  }

  const favoriteItem = getFavoriteDelegate();
  if (!favoriteItem) return { error: "Favorites are not available in this environment." };

  try {
    if (shouldFavorite) {
      await favoriteItem.upsert({
        where: {
          user_id_listing_id: {
            user_id: session.user.id,
            listing_id: listingId,
          },
        },
        update: {},
        create: {
          user_id: session.user.id,
          listing_id: listingId,
        },
      });
    } else {
      await favoriteItem.deleteMany({
        where: {
          user_id: session.user.id,
          listing_id: listingId,
        },
      });
    }

    revalidatePath("/");
    revalidatePath("/browse");
    revalidatePath("/favorites");
    revalidatePath("/dashboard/purchases");
    return { success: true, isFavorited: shouldFavorite };
  } catch (error) {
    console.error("setFavoriteForListing error:", error);
    return { error: "Failed to update favorite." };
  }
}
