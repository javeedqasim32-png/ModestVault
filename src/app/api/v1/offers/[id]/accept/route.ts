import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { mapOfferError } from "@/lib/api/offer-error";
import { acceptOffer, getOfferThreadForUser } from "@/lib/offers";
import { serializeOfferThread } from "@/lib/offers/serialize";

export const dynamic = "force-dynamic";

/** POST /api/v1/offers/[id]/accept — accept the amount on the table. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = await requireBearer(req);
  if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");
  const { id } = await params;
  try {
    await acceptOffer({ actorId: principal.id, offerId: id });
    const thread = await getOfferThreadForUser(principal.id, id);
    return NextResponse.json({ offer: serializeOfferThread(thread) });
  } catch (e) {
    return mapOfferError(e);
  }
}
