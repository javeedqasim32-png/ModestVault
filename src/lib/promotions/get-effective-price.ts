import { prisma } from "@/lib/prisma";

/**
 * The result of resolving a listing's price against any active promotion
 * campaign. When no promo applies, `effectiveCents === originalCents`,
 * `discountPercent === 0`, and `promotionCampaignId === null`.
 *
 * Everything flows through this helper:
 *   - Serializer → card/detail UI (display)
 *   - Checkout actions → Stripe unit_amount (source of truth for charge)
 *
 * The client cannot override any of these — server always re-derives from
 * the listing id alone.
 */
export type EffectivePrice = {
    originalCents: number;
    effectiveCents: number;
    discountPercent: number;
    promotionCampaignId: string | null;
};

/**
 * All four conditions must hold for a discount to apply:
 *   1. PromotionCampaign.status = "ACTIVE"
 *   2. NOW() BETWEEN campaign.starts_at AND campaign.ends_at
 *   3. ListingPromotion.status = "ACCEPTED" for this listing
 *   4. Listing.status = "AVAILABLE"
 *
 * If any fails, we return the original price. That means expired campaigns
 * automatically stop discounting without any code changes — the effect is
 * driven by date/status gates, not permanent listing edits.
 */
export async function getEffectivePriceForListing(
    listingId: string,
): Promise<EffectivePrice> {
    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true, price: true, status: true },
    });
    if (!listing) {
        return {
            originalCents: 0,
            effectiveCents: 0,
            discountPercent: 0,
            promotionCampaignId: null,
        };
    }

    const originalCents = Math.round(Number(listing.price) * 100);
    const bare: EffectivePrice = {
        originalCents,
        effectiveCents: originalCents,
        discountPercent: 0,
        promotionCampaignId: null,
    };

    if (listing.status !== "AVAILABLE") return bare;

    const now = new Date();
    // Find the single active-and-accepted campaign for this listing. If a
    // listing were ever in multiple accepted campaigns simultaneously
    // (out-of-scope for v1) we pick the highest discount deterministically.
    const listingPromotion = await prisma.listingPromotion.findFirst({
        where: {
            listing_id: listing.id,
            status: "ACCEPTED",
            promotion_campaign: {
                status: "ACTIVE",
                starts_at: { lte: now },
                ends_at: { gte: now },
            },
        },
        orderBy: { discount_percent: "desc" },
        select: {
            promotion_campaign_id: true,
            discount_percent: true,
        },
    });

    if (!listingPromotion || listingPromotion.discount_percent <= 0) return bare;

    const discountPercent = listingPromotion.discount_percent;
    const effectiveCents = Math.round(
        (originalCents * (100 - discountPercent)) / 100,
    );
    return {
        originalCents,
        effectiveCents,
        discountPercent,
        promotionCampaignId: listingPromotion.promotion_campaign_id,
    };
}

/**
 * Bulk variant for feeds/lists (browse, trending, featured, seller storefront).
 * Single round-trip to the DB. Returns a Map keyed by listing id.
 *
 * Callers should pass in every listing id they intend to render prices for;
 * missing entries in the returned Map should be treated as "no promo" (bare
 * price) — but the caller already has the listing.price locally in that case.
 */
export async function getEffectivePricesForListings(
    listings: Array<{ id: string; price: number | string | { toString(): string }; status: string }>,
): Promise<Map<string, EffectivePrice>> {
    const out = new Map<string, EffectivePrice>();
    if (listings.length === 0) return out;

    // Pre-fill everyone with their bare price so we always return an entry.
    for (const l of listings) {
        const originalCents = Math.round(Number(l.price) * 100);
        out.set(l.id, {
            originalCents,
            effectiveCents: originalCents,
            discountPercent: 0,
            promotionCampaignId: null,
        });
    }

    // Only listings that are AVAILABLE can be discounted; skip the query
    // entirely if none of the passed-in listings are.
    const eligibleIds = listings
        .filter((l) => l.status === "AVAILABLE")
        .map((l) => l.id);
    if (eligibleIds.length === 0) return out;

    const now = new Date();
    const promotions = await prisma.listingPromotion.findMany({
        where: {
            listing_id: { in: eligibleIds },
            status: "ACCEPTED",
            promotion_campaign: {
                status: "ACTIVE",
                starts_at: { lte: now },
                ends_at: { gte: now },
            },
        },
        orderBy: { discount_percent: "desc" },
        select: {
            listing_id: true,
            promotion_campaign_id: true,
            discount_percent: true,
        },
    });

    // Multiple accepted campaigns per listing? First hit wins (highest
    // discount because of orderBy desc).
    const seen = new Set<string>();
    for (const p of promotions) {
        if (seen.has(p.listing_id)) continue;
        seen.add(p.listing_id);
        if (p.discount_percent <= 0) continue;
        const bare = out.get(p.listing_id);
        if (!bare) continue;
        const effectiveCents = Math.round(
            (bare.originalCents * (100 - p.discount_percent)) / 100,
        );
        out.set(p.listing_id, {
            originalCents: bare.originalCents,
            effectiveCents,
            discountPercent: p.discount_percent,
            promotionCampaignId: p.promotion_campaign_id,
        });
    }

    return out;
}
