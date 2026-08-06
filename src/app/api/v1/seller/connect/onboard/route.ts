import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { stripe } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/seller/connect/onboard
 *
 * Mobile twin of onboardSellerAction in src/app/actions/stripe.ts.
 * Creates a Stripe Connect Express account if the user doesn't have
 * one yet, then returns a one-shot account_link URL for the hosted
 * onboarding flow. The mobile client opens this URL in the system
 * browser; on app resume the client polls /status to find out whether
 * the user finished onboarding.
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const user = await prisma.user.findUnique({
        where: { id: principal.id },
        select: { stripe_account_id: true, email: true },
    });
    if (!user) return apiError("NOT_FOUND", "User not found.");

    const appUrl = await getAppUrl();

    let stripeAccountId = user.stripe_account_id;
    if (!stripeAccountId) {
        const account = await stripe.accounts.create({
            type: "express",
            email: user.email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
        });
        stripeAccountId = account.id;
        await prisma.user.update({
            where: { id: principal.id },
            data: { stripe_account_id: stripeAccountId },
        });
    }

    const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${appUrl}/sell`,
        return_url: `${appUrl}/sell/onboarding-complete`,
        type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
}
