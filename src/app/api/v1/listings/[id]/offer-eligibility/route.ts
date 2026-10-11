import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { getOfferEligibility } from "@/lib/offers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/listings/[id]/offer-eligibility
 *
 * Button state for "Make an Offer" (3.1): whether this user may offer, why not,
 * and whether they already have an active offer (to deep-link to it instead).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = await requireBearer(req);
  if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");
  const { id } = await params;
  const result = await getOfferEligibility(principal.id, id);
  return NextResponse.json(result);
}
