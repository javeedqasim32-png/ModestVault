import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/app/actions/notifications";
import { getEffectivePriceForListing, getEffectivePricesForListings, type EffectivePrice } from "@/lib/promotions/get-effective-price";

/**
 * Make an Offer / negotiation engine. ALL offer business rules live here —
 * the web server actions (src/app/actions/offers.ts) and the mobile API
 * (/api/v1/offers/*) are thin wrappers. See docs/make-an-offer-plan.md.
 *
 * Phase 1 scope: create / counter / accept / reject / withdraw + the
 * "pay now" fallback on accept (reserve the item for a pay-window). The
 * card-on-file off-session auto-charge (binding offers) is a later phase;
 * accept always takes the AWAITING_PAYMENT path for now.
 */

export const OFFER_RESPONSE_WINDOW_HOURS = 48; // seller/buyer response deadline
export const PAY_WINDOW_HOURS = 24; // "pay now" window after acceptance

export type OfferStatus =
  | "PENDING"
  | "COUNTERED"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "WITHDRAWN"
  | "COMPLETED";

export type OfferRole = "BUYER" | "SELLER";

/** Thrown for every rule violation; entry layers map `code` to their format. */
export class OfferError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "LISTING_UNAVAILABLE"
      | "OFFERS_DISABLED"
      | "INVALID_AMOUNT"
      | "DUPLICATE_ACTIVE_OFFER"
      | "NOT_YOUR_TURN"
      | "INVALID_STATE"
      | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "OfferError";
  }
}

const ACTIVE = ["PENDING", "COUNTERED"] as const;
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000);
// Money in: reject NaN/Infinity up front (Decimal comparisons against NaN are
// all false, which would let a crafted server-action payload slip past the
// range checks) and normalise to cents so Stripe and the DB agree.
const dec = (v: Prisma.Decimal.Value) => {
  const d = new Prisma.Decimal(v);
  if (!d.isFinite()) throw new OfferError("INVALID_AMOUNT", "Enter a valid amount.");
  return d.toDecimalPlaces(2);
};

/** Which role a user plays in an offer, or null if they're neither party. */
function roleOf(offer: { buyer_id: string; seller_id: string }, userId: string): OfferRole | null {
  if (offer.buyer_id === userId) return "BUYER";
  if (offer.seller_id === userId) return "SELLER";
  return null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createOffer(input: {
  buyerId: string;
  listingId: string;
  amount: Prisma.Decimal.Value;
}) {
  const amount = dec(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new OfferError("INVALID_AMOUNT", "Offer must be greater than zero.");
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true,
      user_id: true,
      price: true,
      status: true,
      moderation_status: true,
      offers_enabled: true,
      title: true,
    },
  });
  if (!listing) throw new OfferError("NOT_FOUND", "Listing not found.");
  if (listing.user_id === input.buyerId) {
    throw new OfferError("FORBIDDEN", "You can't make an offer on your own listing.");
  }
  if (listing.status !== "AVAILABLE" || listing.moderation_status !== "APPROVED") {
    throw new OfferError("LISTING_UNAVAILABLE", "This item isn't available for offers.");
  }
  if (!listing.offers_enabled) {
    throw new OfferError("OFFERS_DISABLED", "The seller isn't accepting offers on this item.");
  }
  if (amount.greaterThan(listing.price)) {
    throw new OfferError("INVALID_AMOUNT", "Offer can't exceed the asking price.");
  }

  // One active offer per (buyer, listing).
  const existing = await prisma.offer.findFirst({
    where: { listing_id: listing.id, buyer_id: input.buyerId, status: { in: ACTIVE as unknown as string[] } },
    select: { id: true },
  });
  if (existing) {
    throw new OfferError("DUPLICATE_ACTIVE_OFFER", "You already have an active offer on this item.");
  }

  const offer = await prisma.$transaction(async (tx) => {
    const created = await tx.offer.create({
      data: {
        listing_id: listing.id,
        buyer_id: input.buyerId,
        seller_id: listing.user_id,
        status: "PENDING",
        current_amount: amount,
        current_turn: "SELLER",
        expires_at: hoursFromNow(OFFER_RESPONSE_WINDOW_HOURS),
      },
    });
    await tx.offerEvent.create({
      data: { offer_id: created.id, actor: "BUYER", type: "OFFER", amount },
    });
    return created;
  });

  await notify(listing.user_id, "OFFER_RECEIVED", "New offer received", `New offer of ${money(amount)} on "${listing.title}".`, offer.id);
  return offer;
}

// ---------------------------------------------------------------------------
// Counter
// ---------------------------------------------------------------------------

export async function counterOffer(input: {
  actorId: string;
  offerId: string;
  amount: Prisma.Decimal.Value;
}) {
  const amount = dec(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new OfferError("INVALID_AMOUNT", "Counter must be greater than zero.");
  }

  const offer = await loadActionable(input.offerId);
  const role = requireRole(offer, input.actorId);
  requireTurn(offer, role);

  // A buyer's counter is still a buyer offer: can't exceed asking. A seller
  // may counter above the buyer's offer (up to, not beyond, their own price).
  if (role === "BUYER" && amount.greaterThan(offer.listing.price)) {
    throw new OfferError("INVALID_AMOUNT", "Your counter can't exceed the asking price.");
  }

  const nextTurn: OfferRole = role === "BUYER" ? "SELLER" : "BUYER";
  const updated = await guardedUpdate(offer, {
    status: "COUNTERED",
    current_amount: amount,
    current_turn: nextTurn,
    expires_at: hoursFromNow(OFFER_RESPONSE_WINDOW_HOURS),
  });
  await prisma.offerEvent.create({
    data: { offer_id: offer.id, actor: role, type: "COUNTER", amount },
  });

  const recipient = role === "BUYER" ? offer.seller_id : offer.buyer_id;
  await notify(recipient, "OFFER_COUNTERED", "Counteroffer", `New counteroffer of ${money(amount)} on "${offer.listing.title}".`, offer.id);
  return updated;
}

// ---------------------------------------------------------------------------
// Accept  (Phase 1: AWAITING_PAYMENT fallback — reserve item + pay-window)
// ---------------------------------------------------------------------------

export async function acceptOffer(input: { actorId: string; offerId: string }) {
  const offer = await loadActionable(input.offerId);
  const role = requireRole(offer, input.actorId);
  requireTurn(offer, role); // only the party being asked can accept what's on the table

  if (offer.listing.status !== "AVAILABLE") {
    throw new OfferError("LISTING_UNAVAILABLE", "This item is no longer available.");
  }
  if (offer.listing.reserved_offer_id && offer.listing.reserved_offer_id !== offer.id && offer.listing.reserved_until && offer.listing.reserved_until > new Date()) {
    throw new OfferError("CONFLICT", "This item is reserved for another buyer right now.");
  }

  const payWindow = hoursFromNow(PAY_WINDOW_HOURS);
  const updated = await prisma.$transaction(async (tx) => {
    // Optimistic guard: only transition if still actionable & same turn.
    const res = await tx.offer.updateMany({
      where: { id: offer.id, status: { in: ACTIVE as unknown as string[] }, current_turn: role, updated_at: offer.updated_at },
      data: {
        status: "ACCEPTED",
        payment_state: "AWAITING_PAYMENT",
        pay_window_expires_at: payWindow,
      },
    });
    if (res.count === 0) throw new OfferError("CONFLICT", "This offer was just updated. Refresh and try again.");

    // Reserve the item for the buyer during the pay-window.
    await tx.listing.update({
      where: { id: offer.listing_id },
      data: { reserved_offer_id: offer.id, reserved_until: payWindow },
    });
    await tx.offerEvent.create({
      data: { offer_id: offer.id, actor: role, type: "ACCEPT", amount: offer.current_amount },
    });
    return tx.offer.findUnique({ where: { id: offer.id } });
  });

  // The buyer always pays — notify them to complete payment.
  await notify(offer.buyer_id, "OFFER_ACCEPTED", "Offer accepted — pay now", `Your offer of ${money(offer.current_amount)} on "${offer.listing.title}" was accepted. Complete payment within ${PAY_WINDOW_HOURS}h.`, offer.id);
  return updated;
}

// ---------------------------------------------------------------------------
// Reject / Withdraw
// ---------------------------------------------------------------------------

export async function rejectOffer(input: { actorId: string; offerId: string }) {
  const offer = await loadActionable(input.offerId);
  const role = requireRole(offer, input.actorId);
  requireTurn(offer, role);

  const updated = await guardedUpdate(offer, { status: "REJECTED" });
  await prisma.offerEvent.create({ data: { offer_id: offer.id, actor: role, type: "REJECT" } });

  const recipient = role === "SELLER" ? offer.buyer_id : offer.seller_id;
  await notify(recipient, "OFFER_REJECTED", "Offer declined", `Your ${money(offer.current_amount)} offer on "${offer.listing.title}" was declined.`, offer.id);
  return updated;
}

export async function withdrawOffer(input: { buyerId: string; offerId: string }) {
  const offer = await loadActionable(input.offerId);
  if (offer.buyer_id !== input.buyerId) throw new OfferError("FORBIDDEN", "Not your offer.");

  const updated = await guardedUpdate(offer, { status: "WITHDRAWN" });
  await prisma.offerEvent.create({ data: { offer_id: offer.id, actor: "BUYER", type: "WITHDRAW" } });
  await notify(offer.seller_id, "OFFER_REJECTED", "Offer withdrawn", `A buyer withdrew their offer on "${offer.listing.title}".`, offer.id);
  return updated;
}

// ---------------------------------------------------------------------------
// Expiration (cron)
// ---------------------------------------------------------------------------

export async function expireOffers() {
  const now = new Date();
  let expiredOffers = 0;
  let releasedReservations = 0;

  // 1. Response-deadline expiries (PENDING/COUNTERED past expires_at).
  const stale = await prisma.offer.findMany({
    where: { status: { in: ACTIVE as unknown as string[] }, expires_at: { lt: now } },
    select: { id: true, buyer_id: true, listing: { select: { title: true } } },
    take: 500,
  });
  for (const o of stale) {
    const res = await prisma.offer.updateMany({
      where: { id: o.id, status: { in: ACTIVE as unknown as string[] }, expires_at: { lt: now } },
      data: { status: "EXPIRED" },
    });
    if (res.count === 0) continue;
    await prisma.offerEvent.create({ data: { offer_id: o.id, actor: "SYSTEM", type: "EXPIRE" } });
    await notify(o.buyer_id, "OFFER_EXPIRED", "Offer expired", `Your offer on "${o.listing.title}" expired without a response.`, o.id);
    expiredOffers++;
  }

  // 2. Reconcile PAID offers. The payment path (checkout-finalize) is left
  //    untouched to avoid risk; instead we detect completion here: an
  //    AWAITING_PAYMENT offer whose listing is now SOLD with a matching
  //    Purchase by that buyer -> COMPLETED. Also expires the losing offers on
  //    that now-sold listing. (Eventually-consistent within the cron interval.)
  let completedOffers = 0;
  const awaiting = await prisma.offer.findMany({
    where: { payment_state: "AWAITING_PAYMENT", status: "ACCEPTED" },
    select: { id: true, buyer_id: true, listing_id: true, listing: { select: { title: true, status: true } } },
    take: 500,
  });
  for (const o of awaiting) {
    if (o.listing.status !== "SOLD") continue;
    const purchase = await prisma.purchase.findFirst({
      where: { buyer_id: o.buyer_id, listing_id: o.listing_id },
      orderBy: { created_at: "desc" },
      select: { id: true },
    });
    if (!purchase) continue;
    const res = await prisma.offer.updateMany({
      where: { id: o.id, payment_state: "AWAITING_PAYMENT" },
      data: { status: "COMPLETED", payment_state: "PAID", purchase_id: purchase.id },
    });
    if (res.count === 0) continue;
    await prisma.offerEvent.create({ data: { offer_id: o.id, actor: "SYSTEM", type: "PAID", amount: null } });
    await prisma.listing.updateMany({ where: { id: o.listing_id, reserved_offer_id: o.id }, data: { reserved_offer_id: null, reserved_until: null } });
    completedOffers++;
    await expireLosingOffers(o.listing_id, o.id, o.listing.title);
  }

  // 3. Pay-window expiries: release the reservation, item goes live again.
  const unpaid = await prisma.offer.findMany({
    where: { payment_state: "AWAITING_PAYMENT", pay_window_expires_at: { lt: now } },
    select: { id: true, buyer_id: true, seller_id: true, listing_id: true, listing: { select: { title: true } } },
    take: 500,
  });
  for (const o of unpaid) {
    const res = await prisma.offer.updateMany({
      where: { id: o.id, payment_state: "AWAITING_PAYMENT", pay_window_expires_at: { lt: now } },
      data: { status: "EXPIRED", payment_state: "CHARGE_FAILED" },
    });
    if (res.count === 0) continue;
    // Only clear the reservation if it still points at this offer.
    await prisma.listing.updateMany({
      where: { id: o.listing_id, reserved_offer_id: o.id },
      data: { reserved_offer_id: null, reserved_until: null },
    });
    await prisma.offerEvent.create({ data: { offer_id: o.id, actor: "SYSTEM", type: "EXPIRE" } });
    await notify(o.buyer_id, "OFFER_EXPIRED", "Payment window expired", `Your accepted offer on "${o.listing.title}" expired — payment wasn't completed in time.`, o.id);
    await notify(o.seller_id, "OFFER_EXPIRED", "Offer payment expired", `The buyer didn't pay for "${o.listing.title}" in time; it's available again.`, o.id);
    releasedReservations++;
  }

  return { expiredOffers, completedOffers, releasedReservations };
}

/** Expire the other active offers on a listing that just sold, notifying those buyers. */
async function expireLosingOffers(listingId: string, winningOfferId: string, title: string) {
  const losers = await prisma.offer.findMany({
    where: { listing_id: listingId, id: { not: winningOfferId }, status: { in: ACTIVE as unknown as string[] } },
    select: { id: true, buyer_id: true },
    take: 500,
  });
  for (const l of losers) {
    const res = await prisma.offer.updateMany({
      where: { id: l.id, status: { in: ACTIVE as unknown as string[] } },
      data: { status: "EXPIRED" },
    });
    if (res.count === 0) continue;
    await prisma.offerEvent.create({ data: { offer_id: l.id, actor: "SYSTEM", type: "EXPIRE" } });
    await notify(l.buyer_id, "OFFER_EXPIRED", "Item sold", `"${title}" was sold, so your offer is no longer active.`, l.id);
  }
}

// ---------------------------------------------------------------------------
// Checkout integration
// ---------------------------------------------------------------------------

/**
 * Price the buyer should be charged at checkout for a listing. If they hold an
 * ACCEPTED offer in its pay-window, that negotiated amount wins over the normal
 * promo-aware price; otherwise falls back to the standard effective price.
 * Called from the single-listing checkout paths in src/app/actions/checkout.ts.
 */
export async function getOfferAwarePrice(listingId: string, buyerId: string): Promise<EffectivePrice> {
  const base = await getEffectivePriceForListing(listingId);
  const offer = await prisma.offer.findFirst({
    where: { listing_id: listingId, buyer_id: buyerId, status: "ACCEPTED", payment_state: "AWAITING_PAYMENT" },
    select: { current_amount: true },
  });
  if (!offer) return base;
  const cents = Math.round(Number(offer.current_amount) * 100);
  return { originalCents: base.originalCents, effectiveCents: cents, discountPercent: 0, promotionCampaignId: null };
}

/**
 * Batch form of getOfferAwarePrice for bundles and carts: promo-aware base
 * prices, overridden per listing by this buyer's accepted offer that is
 * awaiting payment. One query for all offers. Every input id gets an entry.
 */
export async function getOfferAwarePricesForListings(
  listings: Array<{ id: string; price: number | string | { toString(): string }; status: string }>,
  buyerId: string,
): Promise<Map<string, EffectivePrice>> {
  const base = await getEffectivePricesForListings(listings);
  if (listings.length === 0) return base;
  const offers = await prisma.offer.findMany({
    where: {
      listing_id: { in: listings.map((l) => l.id) },
      buyer_id: buyerId,
      status: "ACCEPTED",
      payment_state: "AWAITING_PAYMENT",
    },
    select: { listing_id: true, current_amount: true },
  });
  for (const o of offers) {
    const b = base.get(o.listing_id);
    if (!b) continue;
    base.set(o.listing_id, {
      originalCents: b.originalCents,
      effectiveCents: Math.round(Number(o.current_amount) * 100),
      discountPercent: 0,
      promotionCampaignId: null,
    });
  }
  return base;
}

/**
 * True when this item is reserved for another buyer's accepted offer during its
 * pay-window. Checkout rejects other buyers while this holds.
 */
export async function isReservedForOtherBuyer(
  listing: { reserved_offer_id: string | null; reserved_until: Date | null },
  buyerId: string,
): Promise<boolean> {
  if (!listing.reserved_offer_id || !listing.reserved_until || listing.reserved_until <= new Date()) {
    return false;
  }
  const resOffer = await prisma.offer.findUnique({
    where: { id: listing.reserved_offer_id },
    select: { buyer_id: true },
  });
  return !!resOffer && resOffer.buyer_id !== buyerId;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getOfferThreadForUser(userId: string, offerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      events: { orderBy: { created_at: "asc" } },
      listing: { select: { id: true, title: true, price: true, image_url: true, status: true, size: true, condition: true } },
      buyer: { select: { id: true, first_name: true } },
      seller: { select: { id: true, first_name: true } },
    },
  });
  if (!offer) throw new OfferError("NOT_FOUND", "Offer not found.");
  const role = roleOf(offer, userId);
  if (!role) throw new OfferError("FORBIDDEN", "Not your offer.");

  // Consolidate: a buyer who re-offers on the same item after a rejection or
  // expiry creates a new Offer row each time. Surface the whole relationship
  // as one thread by merging every attempt's events (same buyer + listing)
  // into a single chronological history.
  const siblings = await prisma.offer.findMany({
    where: { listing_id: offer.listing_id, buyer_id: offer.buyer_id },
    select: { id: true, events: { orderBy: { created_at: "asc" } } },
  });
  const mergedEvents = siblings
    .flatMap((s) => s.events)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  return { ...offer, events: mergedEvents, attemptCount: siblings.length, viewerRole: role };
}

export async function listOffersForUser(userId: string, role: OfferRole) {
  const where = role === "BUYER" ? { buyer_id: userId } : { seller_id: userId };
  return prisma.offer.findMany({
    where,
    orderBy: { updated_at: "desc" },
    include: {
      listing: { select: { id: true, title: true, price: true, image_url: true } },
      buyer: { select: { id: true, first_name: true } },
      seller: { select: { id: true, first_name: true } },
    },
    take: 100,
  });
}

/** Button state for 3.1 — whether this user may make an offer on this listing. */
export async function getOfferEligibility(userId: string | null, listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { user_id: true, status: true, moderation_status: true, offers_enabled: true },
  });
  if (!listing) return { eligible: false, reason: "NOT_FOUND" as const };
  if (!listing.offers_enabled) return { eligible: false, reason: "OFFERS_DISABLED" as const };
  if (listing.status !== "AVAILABLE" || listing.moderation_status !== "APPROVED") {
    return { eligible: false, reason: "UNAVAILABLE" as const };
  }
  if (userId && listing.user_id === userId) return { eligible: false, reason: "OWN_LISTING" as const };

  let activeOfferId: string | null = null;
  if (userId) {
    const active = await prisma.offer.findFirst({
      where: { listing_id: listingId, buyer_id: userId, status: { in: ACTIVE as unknown as string[] } },
      select: { id: true },
    });
    activeOfferId = active?.id ?? null;
  }
  return { eligible: true as const, reason: null, hasActiveOffer: !!activeOfferId, activeOfferId };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ActionableOffer = Awaited<ReturnType<typeof loadActionable>>;

async function loadActionable(offerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      listing: { select: { id: true, title: true, price: true, status: true, reserved_offer_id: true, reserved_until: true } },
    },
  });
  if (!offer) throw new OfferError("NOT_FOUND", "Offer not found.");
  return offer;
}

function requireRole(offer: { buyer_id: string; seller_id: string }, userId: string): OfferRole {
  const role = roleOf(offer, userId);
  if (!role) throw new OfferError("FORBIDDEN", "Not your offer.");
  return role;
}

function requireTurn(offer: { status: string; current_turn: string }, role: OfferRole) {
  if (!(ACTIVE as unknown as string[]).includes(offer.status)) {
    throw new OfferError("INVALID_STATE", "This offer is no longer active.");
  }
  if (offer.current_turn !== role) {
    throw new OfferError("NOT_YOUR_TURN", "It's not your turn to respond to this offer.");
  }
}

/** Status-guarded update that fails loudly on a concurrent change. */
async function guardedUpdate(offer: ActionableOffer, data: Prisma.OfferUpdateManyMutationInput) {
  const res = await prisma.offer.updateMany({
    where: { id: offer.id, status: { in: ACTIVE as unknown as string[] }, updated_at: offer.updated_at },
    data,
  });
  if (res.count === 0) throw new OfferError("CONFLICT", "This offer was just updated. Refresh and try again.");
  return prisma.offer.findUnique({ where: { id: offer.id } });
}

function money(v: Prisma.Decimal.Value) {
  return `$${new Prisma.Decimal(v).toFixed(2)}`;
}

async function notify(userId: string, type: string, title: string, body: string, offerId: string) {
  try {
    await createNotification({ userId, type, title, body, linkUrl: `/offers/${offerId}` });
  } catch (e) {
    console.warn("[offers] notify failed (non-fatal)", { type, offerId, e });
  }
}
