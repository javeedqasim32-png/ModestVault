"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createOffer,
  counterOffer,
  acceptOffer,
  rejectOffer,
  withdrawOffer,
  getOfferThreadForUser,
  listOffersForUser,
  getOfferEligibility,
  OfferError,
  type OfferRole,
} from "@/lib/offers";
import { serializeOfferSummary, serializeOfferThread } from "@/lib/offers/serialize";

/**
 * Website entry layer for offers — thin wrappers over src/lib/offers (same
 * engine the mobile API uses). Each returns a discriminated result the client
 * components can switch on, and revalidates the offer views.
 */

type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new OfferError("FORBIDDEN", "Please sign in.");
  return userId;
}

function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return fn()
    .then((data) => ({ ok: true as const, data }))
    .catch((e) => {
      if (e instanceof OfferError) return { ok: false as const, code: e.code, message: e.message };
      console.error("[offers action] unexpected", e);
      return { ok: false as const, code: "INTERNAL", message: "Something went wrong." };
    });
}

function revalidateOffers(offerId?: string) {
  revalidatePath("/offers");
  if (offerId) revalidatePath(`/offers/${offerId}`);
}

export async function submitOffer(listingId: string, amount: number) {
  return toResult(async () => {
    const userId = await requireUserId();
    const offer = await createOffer({ buyerId: userId, listingId, amount });
    revalidateOffers(offer.id);
    revalidatePath(`/listings/${listingId}`);
    const thread = await getOfferThreadForUser(userId, offer.id);
    return serializeOfferThread(thread);
  });
}

export async function respondToOffer(
  offerId: string,
  action: "accept" | "reject" | "counter",
  amount?: number,
) {
  return toResult(async () => {
    const userId = await requireUserId();
    if (action === "accept") await acceptOffer({ actorId: userId, offerId });
    else if (action === "reject") await rejectOffer({ actorId: userId, offerId });
    else {
      if (amount == null) throw new OfferError("INVALID_AMOUNT", "Counter amount required.");
      await counterOffer({ actorId: userId, offerId, amount });
    }
    revalidateOffers(offerId);
    const thread = await getOfferThreadForUser(userId, offerId);
    return serializeOfferThread(thread);
  });
}

export async function withdrawMyOffer(offerId: string) {
  return toResult(async () => {
    const userId = await requireUserId();
    await withdrawOffer({ buyerId: userId, offerId });
    revalidateOffers(offerId);
    const thread = await getOfferThreadForUser(userId, offerId);
    return serializeOfferThread(thread);
  });
}

export async function getMyOffers(role: OfferRole) {
  return toResult(async () => {
    const userId = await requireUserId();
    const offers = await listOffersForUser(userId, role);
    return offers.map((o) => serializeOfferSummary(o, userId));
  });
}

export async function getOfferThread(offerId: string) {
  return toResult(async () => {
    const userId = await requireUserId();
    const thread = await getOfferThreadForUser(userId, offerId);
    return serializeOfferThread(thread);
  });
}

export async function checkOfferEligibility(listingId: string) {
  return toResult(async () => {
    const session = await auth();
    return getOfferEligibility(session?.user?.id ?? null, listingId);
  });
}
