import { NextResponse } from "next/server";
import { apiError, type ApiErrorCode } from "@/lib/api/errors";
import { CommentError } from "@/lib/comments";

/** Map a CommentError's domain code to the v1 API error envelope. */
const CODE_MAP: Record<CommentError["code"], ApiErrorCode> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  INVALID: "INVALID_INPUT",
  BLOCKED_CONTENT: "INVALID_INPUT",
  RATE_LIMITED: "RATE_LIMITED",
  LISTING_UNAVAILABLE: "CONFLICT",
  ALREADY_REPORTED: "CONFLICT",
};

export function mapCommentError(e: unknown): NextResponse {
  if (e instanceof CommentError) {
    return apiError(CODE_MAP[e.code], e.message);
  }
  console.error("[comments api] unexpected error", e);
  return apiError("INTERNAL", "Something went wrong handling this comment.");
}
