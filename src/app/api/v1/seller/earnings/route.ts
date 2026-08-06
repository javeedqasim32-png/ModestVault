import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { getStripeBalance } from "@/app/actions/stripe";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/seller/earnings
 *
 * Mirrors src/app/(dashboard)/dashboard/earnings/page.tsx. Returns:
 *   - hasStripeAccount: gates the CTA between "set up payouts" and
 *     "open Stripe dashboard" on the client
 *   - balance: live Stripe balance (available + pending) when connected,
 *     zeros otherwise
 *   - awaiting: count + dollar sum of completed sales whose payouts are
 *     parked because the seller hasn't finished Stripe onboarding yet
 *     (seller_transfer_status = AWAITING_SELLER_STRIPE, no transfer id).
 *     Drives the amber "Connect Stripe to claim" card.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const user = await prisma.user.findUnique({
        where: { id: principal.id },
        select: { stripe_account_id: true },
    });
    if (!user) return apiError("NOT_FOUND", "User not found.");

    const balance = user.stripe_account_id
        ? await getStripeBalance(user.stripe_account_id)
        : { available: 0, pending: 0, currency: "USD" };

    const awaitingAggregate = await prisma.order.aggregate({
        where: {
            seller_transfer_status: "AWAITING_SELLER_STRIPE",
            seller_transfer_id: null,
            purchase: { listing: { user_id: principal.id } },
        },
        _sum: { seller_transfer_amount_cents: true },
        _count: true,
    });
    const awaitingCents =
        Number(awaitingAggregate._sum.seller_transfer_amount_cents ?? 0);
    const awaitingCount = awaitingAggregate._count ?? 0;

    return NextResponse.json({
        hasStripeAccount: !!user.stripe_account_id,
        balance: {
            available: balance.available,
            pending: balance.pending,
            currency: balance.currency,
        },
        awaitingCount,
        awaitingDollars: awaitingCents / 100,
    });
}
