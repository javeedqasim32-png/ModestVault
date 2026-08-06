import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/seller/analytics
 *
 * Per-seller stats for the Sell → Insights tab. Mirrors the analytics
 * derivation in src/app/sell/SellPageClient.tsx so the mobile and web
 * cards always read the same numbers.
 *
 * Returns:
 *   totalListings       all listings the seller has ever created (incl. SOLD)
 *   activeListings      AVAILABLE + APPROVED|PARTIAL_APPROVED
 *   soldListings        status = SOLD
 *   pendingListings     moderation_status = PENDING|REJECTED (awaiting/blocked)
 *   averagePrice        mean(price) across all listings (0 if none)
 *   deliveredRevenue    sum(purchase.amount) where order.shipping_status = DELIVERED
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const listings = await prisma.listing.findMany({
        where: { user_id: principal.id },
        select: { price: true, status: true, moderation_status: true },
    });

    const totalListings = listings.length;
    let activeListings = 0;
    let soldListings = 0;
    let pendingListings = 0;
    let priceSum = 0;

    for (const l of listings) {
        priceSum += Number(l.price);
        if (l.status === "SOLD") {
            soldListings += 1;
        } else if (
            l.moderation_status === "APPROVED" ||
            l.moderation_status === "PARTIAL_APPROVED"
        ) {
            activeListings += 1;
        } else {
            // PENDING / REJECTED — still awaiting / blocked from going live.
            pendingListings += 1;
        }
    }

    const averagePrice = totalListings === 0 ? 0 : priceSum / totalListings;

    // Delivered revenue — sum of Purchase.amount across the seller's
    // listings whose Order has shipped + been delivered. Other orders
    // (still in transit, refunded, cancelled) are excluded.
    const deliveredAgg = await prisma.purchase.aggregate({
        where: {
            listing: { user_id: principal.id },
            order: { shipping_status: "DELIVERED" },
        },
        _sum: { amount: true },
    });
    const deliveredRevenue = Number(deliveredAgg._sum.amount ?? 0);

    return NextResponse.json({
        totalListings,
        activeListings,
        soldListings,
        pendingListings,
        averagePrice,
        deliveredRevenue,
    });
}
