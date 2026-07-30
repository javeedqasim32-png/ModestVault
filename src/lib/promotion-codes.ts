// Buyer-facing promo code helpers. Distinct from PromotionCampaign
// (seller-absorbs) — PromotionCode is Modaire-absorbs, discount comes out
// of the platform fee, seller still receives 85% of the ORIGINAL listing
// price. See prisma/schema.prisma → PromotionCode + PromotionCodeRedemption.
//
// Validation lives here so both the buyer-facing pre-check server action
// AND the payment-intent creation flow share the exact same rules — no
// drift possible.

import { prisma } from "@/lib/prisma";

export type PromotionCodeAbsorber = "MODAIRE" | "SELLER";

export type ValidCodeResult = {
    valid: true;
    codeId: string;
    code: string;               // normalized (uppercase)
    discountPercent: number;
    absorber: PromotionCodeAbsorber;
};

export type InvalidCodeResult = {
    valid: false;
    error: string;
};

export type ValidateInput = {
    code: string;
    listingId: string;
    buyerId: string;
};

// Uppercase + trim. Everything reads/writes normalized form so lookups are
// case-insensitive without a functional index.
export function normalizeCode(input: string): string {
    return input.trim().toUpperCase();
}

// Buyer's discounted price on an item, in cents. Rounded DOWN so the buyer
// isn't overcharged by a fraction of a cent — the ceiling on the fee side
// already covers Modaire; being generous here keeps buyer-facing math clean.
export function applyPromotionCodeDiscount(
    originalCents: number,
    discountPercent: number,
): number {
    if (!Number.isFinite(originalCents) || originalCents <= 0) return 0;
    const safePct = Math.max(0, Math.min(100, Math.floor(discountPercent)));
    const discounted = Math.floor(originalCents * (100 - safePct) / 100);
    return Math.max(0, discounted);
}

/**
 * Validate a code for a specific (listing, buyer) checkout attempt. Called
 * both by the buyer-facing pre-check server action AND by the payment-intent
 * creation flow — the client-provided value is validated AGAIN server-side
 * before it's applied.
 *
 * Runs no writes. If the code passes, the caller either shows the discount
 * (pre-check) or plumbs it into the Stripe amount (checkout). The redemption
 * count is bumped only at finalize time (inside the Order-creation
 * transaction) so a payment that never succeeds doesn't burn a redemption.
 */
export async function validatePromotionCode(
    input: ValidateInput,
): Promise<ValidCodeResult | InvalidCodeResult> {
    const normalized = normalizeCode(input.code);
    if (normalized.length === 0) {
        return { valid: false, error: "Enter a promo code." };
    }

    const codeRow = await (prisma as any).promotionCode.findUnique({
        where: { code: normalized },
    });
    if (!codeRow) {
        return { valid: false, error: "This code isn't valid." };
    }
    if (!codeRow.active) {
        return { valid: false, error: "This code is no longer active." };
    }

    const now = new Date();
    if (codeRow.starts_at && now < codeRow.starts_at) {
        return { valid: false, error: "This code isn't valid yet." };
    }
    if (codeRow.expires_at && now > codeRow.expires_at) {
        return { valid: false, error: "This code has expired." };
    }

    if (
        codeRow.max_redemptions !== null &&
        codeRow.max_redemptions !== undefined &&
        codeRow.redemption_count >= codeRow.max_redemptions
    ) {
        return { valid: false, error: "This code has reached its redemption limit." };
    }

    if (codeRow.applies_to_listing_id && codeRow.applies_to_listing_id !== input.listingId) {
        return { valid: false, error: "This code isn't valid on this item." };
    }
    if (codeRow.applies_to_buyer_id && codeRow.applies_to_buyer_id !== input.buyerId) {
        return { valid: false, error: "This code isn't valid for your account." };
    }

    // Stacking with seller-approved PromotionCampaigns is out of scope for
    // MVP — reject if the listing is currently in an ACCEPTED ListingPromotion
    // on an ACTIVE campaign. Simplifies math and prevents double-dipping.
    const activeSellerPromo = await (prisma as any).listingPromotion.findFirst({
        where: {
            listing_id: input.listingId,
            status: "ACCEPTED",
            promotion_campaign: {
                status: "ACTIVE",
                starts_at: { lte: now },
                ends_at: { gte: now },
            },
        },
        select: { id: true },
    });
    if (activeSellerPromo) {
        return {
            valid: false,
            error: "This listing already has an active sale — the code can't be combined.",
        };
    }

    return {
        valid: true,
        codeId: codeRow.id,
        code: normalized,
        discountPercent: codeRow.discount_percent,
        absorber: (codeRow.absorber === "SELLER" ? "SELLER" : "MODAIRE"),
    };
}
