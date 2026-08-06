import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { stripe } from "@/lib/stripe";
import { isStripeAccountReady } from "@/lib/stripe-connect";
import { releaseSellerPendingTransfers } from "@/lib/seller-transfer-retro-release";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/seller/connect/status
 *
 * Mirrors the side-effects of src/app/sell/onboarding-complete/page.tsx:
 *   1. Look up the seller's Stripe account
 *   2. Flip `seller_enabled` based on isStripeAccountReady
 *   3. If newly ready, release any pending seller transfers
 *
 * The mobile client calls this on app resume after the user comes back
 * from Stripe's hosted onboarding, so the same readiness check that
 * runs on the web return page runs here too.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const user = await prisma.user.findUnique({
        where: { id: principal.id },
        select: { stripe_account_id: true, seller_enabled: true },
    });
    if (!user) return apiError("NOT_FOUND", "User not found.");

    // No Stripe account yet — caller should hit /onboard first.
    if (!user.stripe_account_id) {
        return NextResponse.json({
            hasAccount: false,
            sellerEnabled: false,
            detailsSubmitted: false,
            payoutsEnabled: false,
            chargesEnabled: false,
            currentlyDue: [] as string[],
            releasedDollars: 0,
        });
    }

    const account = await stripe.accounts.retrieve(user.stripe_account_id);
    const ready = isStripeAccountReady(account);

    let releasedDollars = 0;
    if (ready && !user.seller_enabled) {
        await prisma.user.update({
            where: { id: principal.id },
            data: { seller_enabled: true },
        });
        try {
            const r = await releaseSellerPendingTransfers(principal.id);
            releasedDollars = r.totalCentsReleased / 100;
        } catch (err) {
            console.error("Retro-release failed for seller", principal.id, err);
        }
    } else if (!ready && user.seller_enabled) {
        await prisma.user.update({
            where: { id: principal.id },
            data: { seller_enabled: false },
        });
    }

    return NextResponse.json({
        hasAccount: true,
        sellerEnabled: ready,
        detailsSubmitted: !!account.details_submitted,
        payoutsEnabled: !!account.payouts_enabled,
        chargesEnabled: !!account.charges_enabled,
        currentlyDue: account.requirements?.currently_due ?? [],
        releasedDollars,
    });
}
