/**
 * Shared friendly-label mapping for the buyer-facing pill on the Orders page.
 * Both the mobile and desktop views render through this so the seller, the
 * buyer, and the admin all see consistent wording for the same underlying
 * Order.shipping_status enum (NOT_SHIPPED, PROCESSING, SHIPPED, DELIVERED,
 * CANCELLED, RETURNED).
 *
 * Buyer perspective:
 *   - NOT_SHIPPED → "Order placed"  (seller hasn't bought the label yet)
 *   - PROCESSING  → "Processed"     (label printed, awaiting carrier pickup)
 *   - SHIPPED     → "Shipped"       (Shippo TRANSIT events)
 *   - DELIVERED   → "Delivered"
 *   - CANCELLED   → "Cancelled"
 *   - RETURNED    → "Returned"
 *
 * Seller perspective is intentionally separate (lives next to SellPageClient
 * as `getSoldStageLabel`) because NOT_SHIPPED reads as "Sold" there — same
 * data, different verb depending on who's looking.
 */
export function getBuyerOrderStatusLabel(shippingStatus: string | null | undefined): string {
    const normalized = (shippingStatus || "").trim().toUpperCase().replace(/\s+/g, "_");
    switch (normalized) {
        case "DELIVERED": return "Delivered";
        case "SHIPPED": return "Shipped";
        case "PROCESSING": return "Processed";
        case "CANCELLED": return "Cancelled";
        case "RETURNED": return "Returned";
        case "NOT_SHIPPED":
        case "PENDING":
        case "":
        default:
            return "Order placed";
    }
}
