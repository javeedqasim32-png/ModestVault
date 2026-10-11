import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { mapCommentError } from "@/lib/api/comment-error";
import { addComment, listComments, resolveViewer, COMMENT_MAX_LENGTH } from "@/lib/comments";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/listings/[id]/comments   threaded comments (public read; a bearer,
 *                                         if present, only affects canDelete)
 * POST /api/v1/listings/[id]/comments   { body, parentId? } — sign-in required.
 *                                         Returns the fresh thread.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Reads are public: a missing or stale token just means an anonymous viewer.
  let principalId: string | null = null;
  try {
    principalId = (await requireBearer(req))?.id ?? null;
  } catch {
    principalId = null;
  }
  try {
    const comments = await listComments(id, await resolveViewer(principalId));
    return NextResponse.json({ comments });
  } catch (e) {
    return mapCommentError(e);
  }
}

const CreateBody = z.object({
  body: z.string().min(1).max(COMMENT_MAX_LENGTH),
  parentId: z.string().min(1).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = await requireBearer(req);
  if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");
  const { id } = await params;

  const parsed = await parseJsonBody(req, CreateBody);
  if (parsed instanceof NextResponse) return parsed;

  try {
    await addComment({ userId: principal.id, listingId: id, body: parsed.body, parentId: parsed.parentId ?? null });
    const comments = await listComments(id, await resolveViewer(principal.id));
    return NextResponse.json({ comments }, { status: 201 });
  } catch (e) {
    return mapCommentError(e);
  }
}
