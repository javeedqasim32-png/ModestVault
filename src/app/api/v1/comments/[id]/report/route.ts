import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { mapCommentError } from "@/lib/api/comment-error";
import { reportComment } from "@/lib/comments";

export const dynamic = "force-dynamic";

/** POST /api/v1/comments/[id]/report — { reason? }. One report per user per comment; admins notified. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = await requireBearer(req);
  if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");
  const { id } = await params;

  // Body is optional — tolerate an empty request.
  let reason: string | null = null;
  try {
    const j = (await req.json()) as { reason?: unknown } | null;
    if (typeof j?.reason === "string") reason = j.reason.slice(0, 300);
  } catch {
    reason = null;
  }

  try {
    const result = await reportComment({ userId: principal.id, commentId: id, reason });
    return NextResponse.json(result);
  } catch (e) {
    return mapCommentError(e);
  }
}
