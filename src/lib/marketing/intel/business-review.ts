import { prisma } from "@/lib/prisma";
import type { BusinessIntel } from "../types";

/**
 * Business review — gathers "the state of Modaire right now" from the
 * marketplace DB. Fed to the Marketing Director as intelligence so
 * strategic decisions reflect actual conditions, not generic advice.
 *
 * Kept intentionally tight — the Director's LLM context is a scarce
 * resource; we surface signal, not raw dumps. Any query that returns
 * lists is capped at 5 items.
 */
export async function gatherBusinessIntel(): Promise<BusinessIntel> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel — the Director is on a wall clock,
    // and none of these depend on each other.
    const [
        purchases24h,
        activeCarts,
        cartsAdded24h,
        availableCount,
        featuredCount,
        onSaleListingPromos,
        newIn7d,
        unsoldOver30d,
        signups24h,
        signups7d,
        mostViewed7d,
        mostFavorited7dRaw,
        activePromo,
    ] = await Promise.all([
        prisma.purchase.findMany({
            where: { created_at: { gte: dayAgo } },
            select: { amount: true },
        }),
        prisma.cartItem.count(),
        prisma.cartItem.count({ where: { created_at: { gte: dayAgo } } }),
        prisma.listing.count({
            where: {
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
        }),
        prisma.listing.count({
            where: {
                is_featured: true,
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
        }),
        prisma.listingPromotion.count({
            where: {
                status: "ACCEPTED",
                listing: {
                    status: "AVAILABLE",
                    moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
                },
                promotion_campaign: {
                    status: "ACTIVE",
                    starts_at: { lte: now },
                    ends_at: { gte: now },
                },
            },
        }),
        prisma.listing.count({
            where: {
                created_at: { gte: weekAgo },
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
        }),
        prisma.listing.count({
            where: {
                created_at: { lt: monthAgo },
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
        }),
        prisma.user.count({ where: { created_at: { gte: dayAgo } } }),
        prisma.user.count({ where: { created_at: { gte: weekAgo } } }),
        prisma.listing.findMany({
            where: {
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
            orderBy: { view_count: "desc" },
            take: 5,
            select: {
                id: true,
                title: true,
                category: true,
                price: true,
                view_count: true,
            },
        }),
        // Prisma doesn't do "order by count of related favorites" natively
        // without groupBy; do a raw-ish group by favoriteItem then hydrate.
        prisma.favoriteItem.groupBy({
            by: ["listing_id"],
            where: { created_at: { gte: weekAgo } },
            _count: { listing_id: true },
            orderBy: { _count: { listing_id: "desc" } },
            take: 5,
        }),
        prisma.promotionCampaign.findFirst({
            where: {
                status: "ACTIVE",
                starts_at: { lte: now },
                ends_at: { gte: now },
            },
            orderBy: { starts_at: "desc" },
            select: {
                name: true,
                discount_percent: true,
                ends_at: true,
            },
        }),
    ]);

    // Hydrate mostFavorited7d with listing details (Prisma groupBy
    // returns just ids + counts).
    const favListingIds = mostFavorited7dRaw.map((r) => r.listing_id);
    const favListingLookup = favListingIds.length
        ? await prisma.listing.findMany({
            where: {
                id: { in: favListingIds },
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
            select: { id: true, title: true, category: true, price: true },
        })
        : [];
    const favById = new Map(favListingLookup.map((l) => [l.id, l]));
    const mostFavorited7d = mostFavorited7dRaw
        .map((r) => {
            const l = favById.get(r.listing_id);
            if (!l) return null;
            return {
                id: l.id,
                title: l.title,
                category: l.category,
                price: Number(l.price),
                favoriteCount: r._count.listing_id,
            };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const grossRevenue = purchases24h.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
    );

    const activePromoBlock = activePromo
        ? {
            name: activePromo.name,
            discountPercent: activePromo.discount_percent,
            endsAtIso: activePromo.ends_at.toISOString(),
            daysUntilEnd: Math.max(
                0,
                Math.ceil(
                    (activePromo.ends_at.getTime() - now.getTime()) /
                    (24 * 60 * 60 * 1000),
                ),
            ),
        }
        : undefined;

    return {
        period: {
            fromIso: dayAgo.toISOString(),
            toIso: now.toISOString(),
        },
        salesLast24h: {
            purchaseCount: purchases24h.length,
            grossRevenueUsd: Number(grossRevenue.toFixed(2)),
        },
        cart: {
            currentActiveCarts: activeCarts,
            addedLast24h: cartsAdded24h,
        },
        inventory: {
            totalAvailable: availableCount,
            featuredCount,
            onSaleCount: onSaleListingPromos,
            newInLast7Days: newIn7d,
            unsoldOver30Days: unsoldOver30d,
        },
        signups: {
            newUsersLast24h: signups24h,
            newUsersLast7Days: signups7d,
        },
        topListings: {
            mostViewed7d: mostViewed7d.map((l) => ({
                id: l.id,
                title: l.title,
                category: l.category,
                price: Number(l.price),
                viewCount: l.view_count,
            })),
            mostFavorited7d,
        },
        activePromotion: activePromoBlock,
    };
}

/**
 * Render BusinessIntel as a human-readable digest for the Director
 * prompt. Bullets + short lines — token-cheap and easy for the LLM to
 * reason over.
 */
export function renderBusinessIntelForPrompt(intel: BusinessIntel): string {
    const lines: string[] = [];
    lines.push(`# Business review — last 24h`);
    lines.push("");
    lines.push(`**Sales:** ${intel.salesLast24h.purchaseCount} orders, $${intel.salesLast24h.grossRevenueUsd.toFixed(2)} revenue`);
    lines.push(`**Cart:** ${intel.cart.currentActiveCarts} active carts; ${intel.cart.addedLast24h} items added yesterday`);
    lines.push(`**Signups:** +${intel.signups.newUsersLast24h} yesterday, +${intel.signups.newUsersLast7Days} this week`);
    lines.push("");
    lines.push(`**Inventory snapshot:**`);
    lines.push(`- ${intel.inventory.totalAvailable} available listings`);
    lines.push(`- ${intel.inventory.featuredCount} admin-featured`);
    lines.push(`- ${intel.inventory.onSaleCount} currently on sale`);
    lines.push(`- ${intel.inventory.newInLast7Days} new in last 7 days`);
    lines.push(`- ${intel.inventory.unsoldOver30Days} unsold > 30 days (candidates for spotlight or discount)`);

    if (intel.activePromotion) {
        lines.push("");
        lines.push(
            `**Active promo:** ${intel.activePromotion.name} (${intel.activePromotion.discountPercent}% off) — ends in ${intel.activePromotion.daysUntilEnd} day(s)`,
        );
    }

    if (intel.topListings.mostViewed7d.length > 0) {
        lines.push("");
        lines.push(`**Most viewed (7d):**`);
        for (const l of intel.topListings.mostViewed7d) {
            lines.push(`  - ${l.title} — ${l.category} — $${l.price} — ${l.viewCount} views (id: ${l.id})`);
        }
    }
    if (intel.topListings.mostFavorited7d.length > 0) {
        lines.push("");
        lines.push(`**Most favorited (7d):**`);
        for (const l of intel.topListings.mostFavorited7d) {
            lines.push(`  - ${l.title} — ${l.category} — $${l.price} — ${l.favoriteCount} favorites (id: ${l.id})`);
        }
    }

    return lines.join("\n");
}
