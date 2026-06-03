"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function trimBody(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function getConversationDelegate() {
  return (prisma as unknown as {
    conversation?: {
      findUnique: (args: unknown) => Promise<any>;
      findFirst: (args: unknown) => Promise<any>;
      findMany: (args: unknown) => Promise<any[]>;
      create: (args: unknown) => Promise<any>;
      update: (args: unknown) => Promise<any>;
    };
  }).conversation;
}

function getConversationMessageDelegate() {
  return (prisma as unknown as {
    conversationMessage?: {
      create: (args: unknown) => Promise<any>;
      count: (args: unknown) => Promise<number>;
      updateMany: (args: unknown) => Promise<any>;
    };
  }).conversationMessage;
}

export async function startConversationWithSeller(input: { sellerId: string; listingId?: string | null }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Please sign in to send messages." } as const;

  const sellerId = input.sellerId;
  const listingId = input.listingId ?? null;

  if (!sellerId) return { error: "Seller is required." } as const;
  if (sellerId === userId) return { error: "You cannot message yourself." } as const;

  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { id: true } });
  if (!seller) return { error: "Seller not found." } as const;
  const conversationDelegate = getConversationDelegate();
  if (!conversationDelegate) return { error: "Messaging is not available in this environment yet." } as const;

  let conversation = await conversationDelegate.findFirst({
    where: {
      OR: [
        { buyer_id: userId, seller_id: sellerId },
        { buyer_id: sellerId, seller_id: userId },
      ],
    },
    select: { id: true, listing_id: true },
  });

  if (!conversation) {
    conversation = await conversationDelegate.create({
      data: {
        buyer_id: userId,
        seller_id: sellerId,
        listing_id: listingId,
      },
      select: { id: true, listing_id: true },
    });
  } else if (!conversation.listing_id && listingId) {
    await conversationDelegate.update({
      where: { id: conversation.id },
      data: { listing_id: listingId },
    });
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversation.id}`);

  return { success: true, conversationId: conversation.id } as const;
}

/**
 * Buyer-initiated chat with platform support. Reuses Conversation table:
 * the buyer is `buyer_id`, the founding admin is `seller_id`, `listing_id` is
 * NULL (support threads aren't listing-scoped). Find-or-create so a buyer
 * always lands in the same ongoing support thread no matter how many times
 * they click the headphones icon.
 */
export async function startConversationWithSupport() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Please sign in to contact support." } as const;

  // Admins are support — they can't open a support thread to themselves.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_admin: true },
  });
  if (me?.is_admin) {
    return { error: "Admins handle support — you can't message yourself." } as const;
  }

  // Founding admin handles all support traffic. Deterministic pick by oldest
  // `is_admin: true` user; for the 1-admin case (the common one) this just
  // picks them. If multi-admin fan-out is needed later that's a schema change.
  const supportAdmin = await prisma.user.findFirst({
    where: { is_admin: true },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });
  if (!supportAdmin) {
    return { error: "Support is currently unavailable. Please try again later." } as const;
  }

  const conversationDelegate = getConversationDelegate();
  if (!conversationDelegate) {
    return { error: "Messaging is not available in this environment yet." } as const;
  }

  // Bidirectional OR-clause so admin-initiated chats (future) merge with the
  // same row instead of creating a duplicate from the opposite side.
  let conversation = await conversationDelegate.findFirst({
    where: {
      OR: [
        { buyer_id: userId, seller_id: supportAdmin.id },
        { buyer_id: supportAdmin.id, seller_id: userId },
      ],
    },
    select: { id: true },
  });
  if (!conversation) {
    conversation = await conversationDelegate.create({
      data: {
        buyer_id: userId,
        seller_id: supportAdmin.id,
        // listing_id omitted intentionally — support threads aren't
        // listing-scoped (unique constraint is per buyer+seller pair).
      },
      select: { id: true },
    });
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversation.id}`);

  return { success: true, conversationId: conversation.id } as const;
}

export async function sendConversationMessage(input: { conversationId: string; body: string }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Please sign in to send messages." } as const;

  const conversationId = input.conversationId;
  const body = trimBody(input.body || "");

  if (!conversationId) return { error: "Conversation is required." } as const;
  if (!body) return { error: "Message cannot be empty." } as const;
  if (body.length > 1000) return { error: "Message must be 1000 characters or fewer." } as const;

  const conversationDelegate = getConversationDelegate();
  const messageDelegate = getConversationMessageDelegate();
  if (!conversationDelegate || !messageDelegate) return { error: "Messaging is not available in this environment yet." } as const;

  const conversation = await conversationDelegate.findUnique({
    where: { id: conversationId },
    select: { id: true, buyer_id: true, seller_id: true },
  });

  if (!conversation) return { error: "Conversation not found." } as const;
  if (conversation.buyer_id === conversation.seller_id) {
    return { error: "You cannot message yourself." } as const;
  }
  if (conversation.buyer_id !== userId && conversation.seller_id !== userId) {
    return { error: "You do not have access to this conversation." } as const;
  }

  await messageDelegate.create({
    data: {
      conversation_id: conversation.id,
      sender_id: userId,
      body,
    },
  });

  await conversationDelegate.update({
    where: { id: conversation.id },
    data: { updated_at: new Date() },
  });

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversation.id}`);

  return { success: true } as const;
}

export async function markConversationRead(conversationId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  const conversationDelegate = getConversationDelegate();
  const messageDelegate = getConversationMessageDelegate();
  if (!conversationDelegate || !messageDelegate) return;

  const conversation = await conversationDelegate.findUnique({
    where: { id: conversationId },
    select: { id: true, buyer_id: true, seller_id: true },
  });
  if (!conversation) return;
  if (conversation.buyer_id !== userId && conversation.seller_id !== userId) return;

  await messageDelegate.updateMany({
    where: {
      conversation_id: conversation.id,
      sender_id: { not: userId },
      read_at: null,
    },
    data: { read_at: new Date() },
  });
}

export async function getUnreadMessageCountForSessionUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return 0;

  const conversationDelegate = getConversationDelegate();
  const messageDelegate = getConversationMessageDelegate();
  if (!conversationDelegate || !messageDelegate) return 0;

  const conversations = await conversationDelegate.findMany({
    where: {
      OR: [{ buyer_id: userId }, { seller_id: userId }],
    },
    select: { id: true },
  });

  if (conversations.length === 0) return 0;

  return messageDelegate.count({
    where: {
      conversation_id: { in: conversations.map((c) => c.id) },
      sender_id: { not: userId },
      read_at: null,
    },
  });
}
