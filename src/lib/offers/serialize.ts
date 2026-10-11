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
  listing: { id: string; title: string; price: Prisma.Decimal; image_url?: string | null };
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

export function serializeOfferThread(
  o: OfferWithRefs & { events: OfferEventRow[]; viewerRole: "BUYER" | "SELLER" },
) {
  return {
    ...serializeOfferSummary(o, o.viewerRole === "BUYER" ? o.buyer_id : o.seller_id),
    viewerRole: o.viewerRole,
    events: o.events.map((e) => ({
      id: e.id,
      actor: e.actor, // BUYER | SELLER | SYSTEM
      type: e.type, // OFFER | COUNTER | ACCEPT | REJECT | EXPIRE | WITHDRAW | PAID
      amount: num(e.amount),
      createdAt: e.created_at.toISOString(),
    })),
  };
}
