import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { mapOfferError } from "@/lib/api/offer-error";
import { counterOffer, getOfferThreadForUser } from "@/lib/offers";
import { serializeOfferThread } from "@/lib/offers/serialize";

export const dynamic = "force-dynamic";

const Body = z.object({ amount: z.number().positive() });

/** POST /api/v1/offers/[id]/counter — propose a different price { amount }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = await requireBearer(req);
  if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");
  const { id } = await params;
  const parsed = await parseJsonBody(req, Body);
  if (parsed instanceof NextResponse) return parsed;
  try {
    await counterOffer({ actorId: principal.id, offerId: id, amount: parsed.amount });
    const thread = await getOfferThreadForUser(principal.id, id);
    return NextResponse.json({ offer: serializeOfferThread(thread) });
  } catch (e) {
    return mapOfferError(e);
  }
}
