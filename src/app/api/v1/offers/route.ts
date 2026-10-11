import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { mapOfferError } from "@/lib/api/offer-error";
import { createOffer, listOffersForUser, getOfferThreadForUser, type OfferRole } from "@/lib/offers";
import { serializeOfferSummary, serializeOfferThread } from "@/lib/offers/serialize";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  listingId: z.string().min(1),
  amount: z.number().positive(),
});

/**
 * POST /api/v1/offers          submit an offer { listingId, amount }
 * GET  /api/v1/offers?role=buying|selling   list my offers (default: buying)
 */
export async function POST(req: NextRequest) {
  const principal = await requireBearer(req);
  if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

  const parsed = await parseJsonBody(req, CreateBody);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const offer = await createOffer({
      buyerId: principal.id,
      listingId: parsed.listingId,
      amount: parsed.amount,
    });
    const thread = await getOfferThreadForUser(principal.id, offer.id);
    return NextResponse.json({ offer: serializeOfferThread(thread) }, { status: 201 });
  } catch (e) {
    return mapOfferError(e);
  }
}

export async function GET(req: NextRequest) {
  const principal = await requireBearer(req);
  if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

  const roleParam = new URL(req.url).searchParams.get("role");
  const role: OfferRole = roleParam === "selling" ? "SELLER" : "BUYER";

  const offers = await listOffersForUser(principal.id, role);
  return NextResponse.json({
    role: role === "SELLER" ? "selling" : "buying",
    offers: offers.map((o) => serializeOfferSummary(o, principal.id)),
  });
}
