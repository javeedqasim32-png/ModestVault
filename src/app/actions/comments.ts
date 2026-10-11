"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addComment,
  deleteComment,
  reportComment,
  listComments,
  resolveViewer,
  CommentError,
  type SerializedComment,
} from "@/lib/comments";

/**
 * Website entry layer for listing comments — thin wrappers over
 * src/lib/comments (the same engine the mobile API uses). Mutations return
 * the fresh thread so the client updates in one round-trip.
 */

type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return fn()
    .then((data) => ({ ok: true as const, data }))
    .catch((e) => {
      if (e instanceof CommentError) return { ok: false as const, code: e.code, message: e.message };
      console.error("[comments action] unexpected", e);
      return { ok: false as const, code: "INTERNAL", message: "Something went wrong." };
    });
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new CommentError("FORBIDDEN", "Please sign in to comment.");
  return userId;
}

/** Public read — works signed out; a signed-in viewer gets correct canDelete flags. */
export async function getListingComments(listingId: string): Promise<ActionResult<SerializedComment[]>> {
  return toResult(async () => {
    const session = await auth();
    return listComments(listingId, await resolveViewer(session?.user?.id ?? null));
  });
}

export async function postComment(listingId: string, body: string, parentId?: string | null) {
  return toResult(async () => {
    const userId = await requireUserId();
    await addComment({ userId, listingId, body, parentId: parentId ?? null });
    revalidatePath(`/listings/${listingId}`);
    return listComments(listingId, await resolveViewer(userId));
  });
}

export async function removeComment(listingId: string, commentId: string) {
  return toResult(async () => {
    const userId = await requireUserId();
    const viewer = await resolveViewer(userId);
    if (!viewer) throw new CommentError("FORBIDDEN", "Please sign in.");
    await deleteComment({ viewer, commentId });
    revalidatePath(`/listings/${listingId}`);
    return listComments(listingId, viewer);
  });
}

export async function flagComment(commentId: string, reason?: string | null) {
  return toResult(async () => {
    const userId = await requireUserId();
    return reportComment({ userId, commentId, reason: reason ?? null });
  });
}
