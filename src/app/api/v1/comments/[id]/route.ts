import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { mapCommentError } from "@/lib/api/comment-error";
import { deleteComment, resolveViewer } from "@/lib/comments";

export const dynamic = "force-dynamic";

/** DELETE /api/v1/comments/[id] — soft-remove; author, listing seller, or admin only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = await requireBearer(req);
  if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");
  const { id } = await params;
  try {
    const viewer = await resolveViewer(principal.id);
    if (!viewer) return apiError("UNAUTHORIZED", "Sign in required.");
    await deleteComment({ viewer, commentId: id });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return mapCommentError(e);
  }
}
