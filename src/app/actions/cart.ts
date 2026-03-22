"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function isMissingCartTableError(error: unknown) {
  return error instanceof Error && error.message.includes("CartItem");
}

function getCartDelegate() {
  return (prisma as unknown as { cartItem?: {
    count: (args: unknown) => Promise<number>;
    upsert: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  } }).cartItem;
}

export async function getCartCountForSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return 0;
  const cartItem = getCartDelegate();
  if (!cartItem) return 0;

  try {
    return await cartItem.count({
      where: {
        user_id: session.user.id,
        listing: {
          status: "AVAILABLE",
        },
      },
    });
  } catch (error) {
    if (
      isMissingCartTableError(error) ||
      (error instanceof TypeError && error.message.includes("undefined"))
    ) {
      return 0;
    }
    throw error;
  }
}

export async function addToCartAndRedirect(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/listings/${listingId}`);
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, status: true, user_id: true },
  });

  if (!listing) throw new Error("Listing not found.");
  if (listing.status !== "AVAILABLE") throw new Error("This item is no longer available.");
  if (listing.user_id === session.user.id) throw new Error("You cannot add your own listing to cart.");
  const cartItem = getCartDelegate();
  if (!cartItem) {
    redirect("/cart");
  }

  try {
    await cartItem.upsert({
      where: {
        user_id_listing_id: {
          user_id: session.user.id,
          listing_id: listingId,
        },
      },
      create: {
        user_id: session.user.id,
        listing_id: listingId,
      },
      update: {},
    });
  } catch (error) {
    if (
      !isMissingCartTableError(error) &&
      !(error instanceof TypeError && error.message.includes("undefined"))
    ) {
      throw error;
    }
  }

  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath("/listings/[id]", "page");
  revalidatePath("/cart");
  redirect("/cart");
}

export async function removeCartItem(cartItemId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/cart");
  }

  const cartItem = getCartDelegate();
  if (!cartItem) return;

  try {
    await cartItem.deleteMany({
      where: {
        id: cartItemId,
        user_id: session.user.id,
      },
    });
  } catch (error) {
    if (
      !isMissingCartTableError(error) &&
      !(error instanceof TypeError && error.message.includes("undefined"))
    ) {
      throw error;
    }
  }

  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath("/cart");
}
