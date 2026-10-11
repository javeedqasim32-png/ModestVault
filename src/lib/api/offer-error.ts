import { NextResponse } from "next/server";
import { apiError, type ApiErrorCode } from "@/lib/api/errors";
import { OfferError } from "@/lib/offers";

/** Map an OfferError's domain code to the v1 API error envelope. */
const CODE_MAP: Record<OfferError["code"], ApiErrorCode> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  LISTING_UNAVAILABLE: "CONFLICT",
  OFFERS_DISABLED: "CONFLICT",
  INVALID_AMOUNT: "INVALID_INPUT",
  DUPLICATE_ACTIVE_OFFER: "CONFLICT",
  NOT_YOUR_TURN: "CONFLICT",
  INVALID_STATE: "CONFLICT",
  CONFLICT: "CONFLICT",
};

export function mapOfferError(e: unknown): NextResponse {
  if (e instanceof OfferError) {
    return apiError(CODE_MAP[e.code], e.message);
  }
  console.error("[offers api] unexpected error", e);
  return apiError("INTERNAL", "Something went wrong handling this offer.");
}
