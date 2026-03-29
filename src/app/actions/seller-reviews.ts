"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function upsertSellerReview(input: { sellerId: string; rating: number; text: string }) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please sign in to write a review." };

  const sellerId = input.sellerId?.trim();
  const rating = Number(input.rating);
  const text = input.text?.trim();

  if (!sellerId) return { error: "Seller is required." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be between 1 and 5." };
  if (!text || text.length < 8) return { error: "Review is too short." };
  if (text.length > 600) return { error: "Review is too long." };
  if (session.user.id === sellerId) return { error: "You cannot review your own profile." };

  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { id: true } });
  if (!seller) return { error: "Seller not found." };

  const review = await prisma.sellerReview.upsert({
    where: {
      seller_id_reviewer_id: {
        seller_id: sellerId,
        reviewer_id: session.user.id,
      },
    },
    update: {
      rating,
      text,
    },
    create: {
      seller_id: sellerId,
      reviewer_id: session.user.id,
      rating,
      text,
    },
    include: {
      reviewer: {
        select: {
          first_name: true,
          last_name: true,
        },
      },
    },
  });

  revalidatePath(`/sellers/${sellerId}`);

  return {
    ok: true,
    review: {
      id: review.id,
      sellerId: review.seller_id,
      reviewerName: `${review.reviewer.first_name} ${review.reviewer.last_name?.[0] ? `${review.reviewer.last_name[0].toUpperCase()}.` : ""}`.trim(),
      rating: review.rating,
      text: review.text,
      dateLabel: review.created_at.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    },
  };
}
