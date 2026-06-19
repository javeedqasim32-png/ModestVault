"use server";

import { randomUUID } from "crypto";
import sharp from "sharp";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { buildS3ImageUrl, getS3BucketName, uploadFile } from "@/lib/s3";
import { createNotification } from "@/app/actions/notifications";

const MESSAGE_IMAGE_ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MESSAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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

export async function sendConversationMessage(input: { conversationId: string; body: string; imageFile?: File | null }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Please sign in to send messages." } as const;

  const conversationId = input.conversationId;
  const body = trimBody(input.body || "");
  const imageFile = input.imageFile && typeof input.imageFile.arrayBuffer === "function" && input.imageFile.size > 0
    ? input.imageFile
    : null;

  if (!conversationId) return { error: "Conversation is required." } as const;
  // Image-only sends are allowed; require either text or a photo.
  if (!body && !imageFile) return { error: "Message cannot be empty." } as const;
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

  // Optional image attachment. Mirrors the sharp + S3 pipeline used by the
  // listings and AI-cover endpoints: validate, downscale, upload, then store
  // the URL on the message row.
  let imageUrl: string | null = null;
  if (imageFile) {
    const mime = imageFile.type || "";
    if (!MESSAGE_IMAGE_ALLOWED_MIME.includes(mime)) {
      return { error: "Only PNG, JPEG, and WebP images are allowed." } as const;
    }
    if (imageFile.size > MESSAGE_IMAGE_MAX_BYTES) {
      return { error: "Image must be 10MB or smaller." } as const;
    }
    const bucket = getS3BucketName();
    if (!bucket) {
      return { error: "Image uploads are not configured on this server." } as const;
    }
    try {
      const raw = Buffer.from(await imageFile.arrayBuffer());
      // Auto-rotate per EXIF, cap to 1200px wide, output JPEG q85. Brings a
      // 10MB phone photo down to ~150-400KB for fast bubble rendering.
      const processed = await sharp(raw)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const key = `messages/${conversation.id}/${randomUUID()}.jpg`;
      await uploadFile(processed, key, "image/jpeg", bucket);
      imageUrl = buildS3ImageUrl(key, bucket);
    } catch (err) {
      console.error("Message image upload failed:", err);
      return { error: "Failed to upload the image. Please try again." } as const;
    }
  }

  await messageDelegate.create({
    data: {
      conversation_id: conversation.id,
      sender_id: userId,
      body,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    },
  });

  await conversationDelegate.update({
    where: { id: conversation.id },
    data: { updated_at: new Date() },
  });

  // Side effects — fire-and-forget so an email/notification failure can't
  // strand the send. The recipient is whichever conversation party isn't
  // the sender.
  const recipientId =
    conversation.buyer_id === userId
      ? conversation.seller_id
      : conversation.buyer_id;
  await notifyMessageRecipient({
    senderId: userId,
    recipientId,
    conversationId: conversation.id,
    body,
    hasImage: imageUrl !== null,
  });

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversation.id}`);

  return { success: true } as const;
}

/**
 * Real-time fan-out after a message lands: in-app notification + queued
 * push. Looks up both parties in one round-trip so we can use the
 * sender's name in the in-app banner. Failures here NEVER propagate —
 * sendConversationMessage has already committed the row.
 *
 * Email is intentionally NOT fired here. It's sent by the cron at
 * /api/internal/send-new-message-emails ~5 min later, only if the
 * recipient still hasn't opened the message. That way back-and-forth
 * live conversations don't generate per-message email spam.
 */
async function notifyMessageRecipient(args: {
  senderId: string;
  recipientId: string;
  conversationId: string;
  body: string;
  hasImage: boolean;
}) {
  try {
    const [sender, recipient] = await Promise.all([
      prisma.user.findUnique({
        where: { id: args.senderId },
        select: { first_name: true, last_name: true },
      }),
      prisma.user.findUnique({
        where: { id: args.recipientId },
        select: { is_admin: true },
      }),
    ]);
    if (!recipient) return;
    // Don't notify the founding-admin support user for self-replies.
    if (recipient.is_admin && args.senderId === args.recipientId) return;

    const senderName =
      [sender?.first_name, sender?.last_name]
        .filter((s): s is string => !!s && s.trim().length > 0)
        .join(" ")
        .trim() || "Someone";

    const preview = args.body.trim() || (args.hasImage ? "📷 Sent a photo" : "");
    const inAppPreview =
      preview.length > 80 ? `${preview.slice(0, 80).trimEnd()}…` : preview;

    await createNotification({
      userId: args.recipientId,
      type: "NEW_MESSAGE",
      title: `New message from ${senderName}`,
      body: inAppPreview,
      linkUrl: `/messages/${args.conversationId}`,
    });
  } catch (err) {
    console.error("[notifyMessageRecipient] failed (non-fatal):", err);
  }
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
