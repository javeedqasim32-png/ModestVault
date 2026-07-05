/**
 * Utility to convert Prisma Decimal objects to plain JavaScript numbers
 * for serialization to Client Components.
 */

import type { EffectivePrice } from "@/lib/promotions/get-effective-price";

/**
 * Shape carried on the wire when a listing is inside an active promotion
 * campaign. Server-computed via getEffectivePriceForListing/-ForListings —
 * the client cannot fabricate this; callers that don't compute it just
 * leave the field undefined and the card renders the plain price.
 */
export type SerializedEffectivePrice = {
    originalCents: number;
    effectiveCents: number;
    discountPercent: number;
    promotionCampaignId: string | null;
};

export function serializeListing(
    listing: any,
    opts?: { effectivePrice?: EffectivePrice | null },
) {
    if (!listing) return null;

    return {
        ...listing,
        price: listing.price ? Number(listing.price) : 0,
        view_count: listing.view_count ? Number(listing.view_count) : 0,
        // Optional promotion payload — undefined when the caller isn't
        // rendering promo-aware UI (older call sites) or when no active
        // campaign applies.
        effective_price:
            opts?.effectivePrice && opts.effectivePrice.discountPercent > 0
                ? {
                      originalCents: opts.effectivePrice.originalCents,
                      effectiveCents: opts.effectivePrice.effectiveCents,
                      discountPercent: opts.effectivePrice.discountPercent,
                      promotionCampaignId: opts.effectivePrice.promotionCampaignId,
                  }
                : undefined,
        // Recursively serialize nested images and ensure their dates are stringified
        images: listing.images ? listing.images.map((img: any) => ({
            ...img,
            created_at: img.created_at?.toISOString?.() || (typeof img.created_at === 'string' ? img.created_at : null),
            updated_at: img.updated_at?.toISOString?.() || (typeof img.updated_at === 'string' ? img.updated_at : null),
        })) : [],
        user: listing.user ? {
            ...listing.user,
            created_at: listing.user.created_at?.toISOString?.() || (typeof listing.user.created_at === 'string' ? listing.user.created_at : null),
        } : undefined,
        created_at: listing.created_at?.toISOString?.() || (typeof listing.created_at === 'string' ? listing.created_at : null),
        updated_at: listing.updated_at?.toISOString?.() || (typeof listing.updated_at === 'string' ? listing.updated_at : null),
        reviewed_at: listing.reviewed_at?.toISOString?.() || (typeof listing.reviewed_at === 'string' ? listing.reviewed_at : null),
    };
}

export function serializePurchase(purchase: any) {
    if (!purchase) return null;

    return {
        ...purchase,
        amount: purchase.amount ? Number(purchase.amount) : 0,
        created_at: purchase.created_at?.toISOString?.() || (typeof purchase.created_at === 'string' ? purchase.created_at : null),
        updated_at: purchase.updated_at?.toISOString?.() || (typeof purchase.updated_at === 'string' ? purchase.updated_at : null),
        listing: purchase.listing ? serializeListing(purchase.listing) : undefined,
        buyer: purchase.buyer ? {
            ...purchase.buyer,
            created_at: purchase.buyer.created_at?.toISOString?.() || (typeof purchase.buyer.created_at === 'string' ? purchase.buyer.created_at : null),
        } : undefined,
        order: purchase.order ? {
            ...purchase.order,
            shipping_option_amount: purchase.order.shipping_option_amount ? Number(purchase.order.shipping_option_amount) : null,
            seller_transfer_amount_cents: purchase.order.seller_transfer_amount_cents ? Number(purchase.order.seller_transfer_amount_cents) : null,
            created_at: purchase.order.created_at?.toISOString?.() || (typeof purchase.order.created_at === 'string' ? purchase.order.created_at : null),
            updated_at: purchase.order.updated_at?.toISOString?.() || (typeof purchase.order.updated_at === 'string' ? purchase.order.updated_at : null),
            delivered_at: purchase.order.delivered_at?.toISOString?.() || (typeof purchase.order.delivered_at === 'string' ? purchase.order.delivered_at : null),
            hold_until: purchase.order.hold_until?.toISOString?.() || (typeof purchase.order.hold_until === 'string' ? purchase.order.hold_until : null),
            seller_transfer_released_at: purchase.order.seller_transfer_released_at?.toISOString?.() || (typeof purchase.order.seller_transfer_released_at === 'string' ? purchase.order.seller_transfer_released_at : null),
            shipping_option_selected_at: purchase.order.shipping_option_selected_at?.toISOString?.() || (typeof purchase.order.shipping_option_selected_at === 'string' ? purchase.order.shipping_option_selected_at : null),
        } : undefined,
    };
}
