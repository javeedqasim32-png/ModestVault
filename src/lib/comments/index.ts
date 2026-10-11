import { prisma } from "@/lib/prisma";
import { createNotification } from "@/app/actions/notifications";
import { findBlockedContent, COMMENT_MAX_LENGTH } from "./guard";

/**
 * Public, threaded comments under a listing. ALL rules live here; the web
 * server actions (src/app/actions/comments.ts) and the mobile API
 * (/api/v1/listings/[id]/comments, /api/v1/comments/[id]/*) are thin wrappers.
 *
 * Guardrails (the scam / fee-circumvention vector is real — see the Oct 2026
 * phishing incident in memory):
 *   - callers enforce sign-in; this module never trusts an unauthenticated id
 *   - DB-backed rate limit: 3 comments / minute, 20 / hour per user
 *   - content guard: links, emails, phone numbers, off-platform contact or
 *     payment terms are rejected with a friendly error
 *   - soft delete (author / listing seller / admin) keeps thread shape
 *   - one report per (comment, user); admins are notified on each report
 *   - replies cap at two levels so threads stay readable
 */

export class CommentError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID"
      | "BLOCKED_CONTENT"
      | "RATE_LIMITED"
      | "LISTING_UNAVAILABLE"
      | "ALREADY_REPORTED",
    message: string,
  ) {
    super(message);
    this.name = "CommentError";
  }
}

export { findBlockedContent, COMMENT_MAX_LENGTH } from "./guard";
const RATE_PER_MINUTE = 3;
const RATE_PER_HOUR = 20;

export type Viewer = { id: string; isAdmin: boolean } | null;

/**
 * Resolve a (possibly absent) user id into the viewer shape the engine needs.
 * The admin flag lives on the User row, not in the session/bearer principal,
 * so both entry layers resolve it here rather than each querying it.
 */
export async function resolveViewer(userId: string | null | undefined): Promise<Viewer> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, is_admin: true } });
  return u ? { id: u.id, isAdmin: u.is_admin } : null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function addComment(input: {
  userId: string;
  listingId: string;
  body: string;
  parentId?: string | null;
}) {
  const body = input.body.trim();
  if (!body) throw new CommentError("INVALID", "Comment can't be empty.");
  if (body.length > COMMENT_MAX_LENGTH) {
    throw new CommentError("INVALID", `Comments are limited to ${COMMENT_MAX_LENGTH} characters.`);
  }
  const blocked = findBlockedContent(body);
  if (blocked) {
    throw new CommentError(
      "BLOCKED_CONTENT",
      `Comments can't include ${blocked}. For private questions, use Message Seller.`,
    );
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, user_id: true, title: true, moderation_status: true },
  });
  if (!listing) throw new CommentError("NOT_FOUND", "Listing not found.");
  if (!["APPROVED", "PARTIAL_APPROVED"].includes(listing.moderation_status)) {
    throw new CommentError("LISTING_UNAVAILABLE", "This listing isn't open for comments.");
  }

  // Rate limit (DB-backed — no Redis in this stack).
  const now = Date.now();
  const [perMinute, perHour] = await Promise.all([
    prisma.listingComment.count({ where: { user_id: input.userId, created_at: { gt: new Date(now - 60_000) } } }),
    prisma.listingComment.count({ where: { user_id: input.userId, created_at: { gt: new Date(now - 3_600_000) } } }),
  ]);
  if (perMinute >= RATE_PER_MINUTE || perHour >= RATE_PER_HOUR) {
    throw new CommentError("RATE_LIMITED", "You're commenting too quickly. Please wait a moment.");
  }

  // Threading: replies attach to the TOP-LEVEL comment (max depth 2).
  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.listingComment.findUnique({
      where: { id: input.parentId },
      select: { id: true, listing_id: true, parent_id: true, user_id: true, deleted_at: true },
    });
    if (!parent || parent.listing_id !== listing.id) throw new CommentError("NOT_FOUND", "Comment not found.");
    if (parent.deleted_at) throw new CommentError("INVALID", "You can't reply to a removed comment.");
    parentId = parent.parent_id ?? parent.id;
    parentAuthorId = parent.user_id;
  }

  const created = await prisma.listingComment.create({
    data: { listing_id: listing.id, user_id: input.userId, parent_id: parentId, body },
  });

  // Notify: the seller on new top-level comments; the parent's author on replies.
  const link = `/listings/${listing.id}#comments`;
  if (parentAuthorId && parentAuthorId !== input.userId) {
    await notify(parentAuthorId, "COMMENT_REPLY", "New reply to your comment", `Someone replied to your comment on "${listing.title}".`, link);
  }
  if (listing.user_id !== input.userId && listing.user_id !== parentAuthorId) {
    await notify(listing.user_id, "COMMENT_RECEIVED", "New comment on your listing", `Someone commented on "${listing.title}".`, link);
  }

  return created;
}

// ---------------------------------------------------------------------------
// Delete (soft) / Report
// ---------------------------------------------------------------------------

export async function deleteComment(input: { viewer: NonNullable<Viewer>; commentId: string }) {
  const c = await prisma.listingComment.findUnique({
    where: { id: input.commentId },
    select: { id: true, user_id: true, deleted_at: true, listing: { select: { user_id: true } } },
  });
  if (!c) throw new CommentError("NOT_FOUND", "Comment not found.");
  if (c.deleted_at) return c;

  const deletedBy =
    input.viewer.id === c.user_id ? "AUTHOR"
    : input.viewer.id === c.listing.user_id ? "SELLER"
    : input.viewer.isAdmin ? "ADMIN"
    : null;
  if (!deletedBy) throw new CommentError("FORBIDDEN", "You can't remove this comment.");

  return prisma.listingComment.update({
    where: { id: c.id },
    data: { deleted_at: new Date(), deleted_by: deletedBy },
  });
}

export async function reportComment(input: { userId: string; commentId: string; reason?: string | null }) {
  const c = await prisma.listingComment.findUnique({
    where: { id: input.commentId },
    select: { id: true, user_id: true, deleted_at: true, listing_id: true, body: true },
  });
  if (!c || c.deleted_at) throw new CommentError("NOT_FOUND", "Comment not found.");
  if (c.user_id === input.userId) throw new CommentError("FORBIDDEN", "You can't report your own comment.");

  try {
    await prisma.commentReport.create({
      data: { comment_id: c.id, reporter_id: input.userId, reason: input.reason?.trim().slice(0, 300) || null },
    });
  } catch (e: unknown) {
    // Unique (comment, reporter) violation -> already reported.
    if ((e as { code?: string })?.code === "P2002") {
      throw new CommentError("ALREADY_REPORTED", "You've already reported this comment.");
    }
    throw e;
  }
  const updated = await prisma.listingComment.update({
    where: { id: c.id },
    data: { report_count: { increment: 1 } },
    select: { report_count: true },
  });

  await notifyAdmins(
    "COMMENT_REPORTED",
    "Comment reported",
    `A comment was reported (${updated.report_count} report${updated.report_count === 1 ? "" : "s"}): "${c.body.slice(0, 80)}"`,
    `/listings/${c.listing_id}#comments`,
  );
  return { reportCount: updated.report_count };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type SerializedComment = {
  id: string;
  body: string;
  deleted: boolean;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
  isSeller: boolean;
  canDelete: boolean;
  replies: SerializedComment[];
};

/**
 * Threaded comments for a listing. Deleted replies are hidden; a deleted
 * top-level comment is shown as "removed" only when it still has visible
 * replies (so the thread keeps its shape), otherwise hidden.
 */
export async function listComments(listingId: string, viewer: Viewer): Promise<SerializedComment[]> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { user_id: true } });
  if (!listing) throw new CommentError("NOT_FOUND", "Listing not found.");

  const rows = await prisma.listingComment.findMany({
    where: { listing_id: listingId },
    orderBy: { created_at: "asc" },
    select: {
      id: true, body: true, user_id: true, parent_id: true, deleted_at: true, created_at: true,
      user: { select: { id: true, first_name: true, last_name: true, profile_image: true } },
    },
  });

  const serialize = (r: (typeof rows)[number], replies: SerializedComment[]): SerializedComment => {
    const deleted = !!r.deleted_at;
    const canDelete =
      !deleted && !!viewer && (viewer.id === r.user_id || viewer.id === listing.user_id || viewer.isAdmin);
    const lastInitial = r.user.last_name?.[0] ? ` ${r.user.last_name[0].toUpperCase()}.` : "";
    return {
      id: r.id,
      body: deleted ? "" : r.body,
      deleted,
      createdAt: r.created_at.toISOString(),
      author: { id: r.user.id, name: `${r.user.first_name}${lastInitial}`.trim(), avatarUrl: r.user.profile_image ?? null },
      isSeller: r.user_id === listing.user_id,
      canDelete,
      replies,
    };
  };

  const repliesByParent = new Map<string, SerializedComment[]>();
  for (const r of rows) {
    if (!r.parent_id || r.deleted_at) continue; // deleted replies are simply hidden
    const list = repliesByParent.get(r.parent_id) ?? [];
    list.push(serialize(r, []));
    repliesByParent.set(r.parent_id, list);
  }

  const out: SerializedComment[] = [];
  for (const r of rows) {
    if (r.parent_id) continue;
    const replies = repliesByParent.get(r.id) ?? [];
    if (r.deleted_at && replies.length === 0) continue; // nothing left to show
    out.push(serialize(r, replies));
  }
  // Newest question first (Q&A reads top-down by recency); replies inside a
  // question stay oldest-first so an exchange reads in order.
  return out.reverse();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function notify(userId: string, type: string, title: string, body: string, linkUrl: string) {
  try {
    await createNotification({ userId, type, title, body, linkUrl });
  } catch (e) {
    console.warn("[comments] notify failed (non-fatal)", { type, e });
  }
}

async function notifyAdmins(type: string, title: string, body: string, linkUrl: string) {
  const admins = await prisma.user.findMany({ where: { is_admin: true, is_disabled: false }, select: { id: true } });
  await Promise.all(admins.map((a) => notify(a.id, type, title, body, linkUrl)));
}
