import type { Prisma } from "@prisma/client";

/**
 * Framework-agnostic JSON shapes for offers, shared by the web UI and the
 * mobile API so both surfaces see identical fields. Money is serialized as a
 * number to match the listing serializers (`price: Number(l.price)`).
 */

const num = (v: Prisma.Decimal | number | null | undefined) =>
  v == null ? null : Number(v);

type OfferWithRefs = {
  id: string;
  status: string;
  current_amount: Prisma.Decimal;
  current_turn: string;
  expires_at: Date;
  payment_state: string | null;
  pay_window_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
  buyer_id: string;
  seller_id: string;
  listing: { id: string; title: string; price: Prisma.Decimal; image_url?: string | null; size?: string | null; condition?: string | null };
  buyer?: { id: string; first_name: string } | null;
  seller?: { id: string; first_name: string } | null;
};

export function serializeOfferSummary(o: OfferWithRefs, viewerId: string) {
  return {
    id: o.id,
    status: o.status,
    currentAmount: num(o.current_amount),
    currentTurn: o.current_turn, // SELLER | BUYER
    viewerRole: o.buyer_id === viewerId ? "BUYER" : "SELLER",
    buyerId: o.buyer_id,
    sellerId: o.seller_id,
    expiresAt: o.expires_at.toISOString(),
    paymentState: o.payment_state,
    payWindowExpiresAt: o.pay_window_expires_at?.toISOString() ?? null,
    createdAt: o.created_at.toISOString(),
    updatedAt: o.updated_at.toISOString(),
    listing: {
      id: o.listing.id,
      title: o.listing.title,
      price: num(o.listing.price),
      imageUrl: o.listing.image_url ?? null,
      size: o.listing.size ?? null,
      condition: o.listing.condition ?? null,
    },
    buyerName: o.buyer?.first_name ?? null,
    sellerName: o.seller?.first_name ?? null,
  };
}

type OfferEventRow = {
  id: string;
  actor: string;
  type: string;
  amount: Prisma.Decimal | null;
  created_at: Date;
};

export type SerializedOfferSummary = ReturnType<typeof serializeOfferSummary>;
export type SerializedOfferThread = ReturnType<typeof serializeOfferThread>;

export function serializeOfferThread(
  o: OfferWithRefs & { events: OfferEventRow[]; viewerRole: "BUYER" | "SELLER"; attemptCount?: number },
) {
  return {
    ...serializeOfferSummary(o, o.viewerRole === "BUYER" ? o.buyer_id : o.seller_id),
    viewerRole: o.viewerRole,
    // Number of separate offer attempts by this buyer on this item; history
    // below is merged across all of them.
    attemptCount: o.attemptCount ?? 1,
    events: o.events.map((e) => ({
      id: e.id,
      actor: e.actor, // BUYER | SELLER | SYSTEM
      type: e.type, // OFFER | COUNTER | ACCEPT | REJECT | EXPIRE | WITHDRAW | PAID
      amount: num(e.amount),
      createdAt: e.created_at.toISOString(),
    })),
  };
}
