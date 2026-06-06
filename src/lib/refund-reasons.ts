// Modaire's own taxonomy of refund reasons. Richer than Stripe's narrow API
// enum (which only accepts `duplicate`, `fraudulent`, `requested_by_customer`)
// so we can run product-level analytics on WHY refunds happen — e.g., to track
// how often items arrive damaged vs. genuinely unavailable.
//
// Stored in Order.refund_reason as the raw `value` (snake_case-ish UPPER_CASE),
// rendered with `label` everywhere a human reads it. The Stripe API call
// always receives `requested_by_customer` regardless — none of the Modaire
// reasons indicate fraud or duplicate billing, and `requested_by_customer` is
// the safest catch-all for buyer-facing legitimate refund requests.

export const MODAIRE_REFUND_REASONS = [
    { value: "BUYER_REQUESTED_CANCELLATION", label: "Buyer Requested Cancellation" },
    { value: "ITEM_UNAVAILABLE", label: "Item Unavailable" },
    { value: "ITEM_NOT_AS_DESCRIBED", label: "Item Not as Described" },
    { value: "ITEM_ARRIVED_DAMAGED", label: "Item Arrived Damaged" },
    { value: "SHIPPING_DELIVERY_ISSUE", label: "Shipping / Delivery Issue" },
    { value: "OTHER", label: "Other" },
] as const;

export type ModaireRefundReason = typeof MODAIRE_REFUND_REASONS[number]["value"];

export const DEFAULT_MODAIRE_REFUND_REASON: ModaireRefundReason = "BUYER_REQUESTED_CANCELLATION";

export function isValidModaireRefundReason(value: unknown): value is ModaireRefundReason {
    return typeof value === "string" && MODAIRE_REFUND_REASONS.some((r) => r.value === value);
}

export function getModaireRefundReasonLabel(value: string): string {
    return MODAIRE_REFUND_REASONS.find((r) => r.value === value)?.label ?? value;
}

// All Modaire reasons map to Stripe's `requested_by_customer` — we never want
// to mark a refund as `fraudulent` or `duplicate` automatically (those have
// specific Stripe accounting implications and should only be set deliberately).
export function toStripeRefundReason(_reason: ModaireRefundReason): "requested_by_customer" {
    return "requested_by_customer";
}

// "OTHER" demands an admin note so we don't end up with an uncategorized
// refund and no context. Enforced in both the UI and the server action.
export function refundReasonRequiresNote(value: ModaireRefundReason): boolean {
    return value === "OTHER";
}
