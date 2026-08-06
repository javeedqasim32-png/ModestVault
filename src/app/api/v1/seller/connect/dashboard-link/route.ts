import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { stripe } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/seller/connect/dashboard-link
 *
 * Mirrors createStripeDashboardLink in src/app/actions/stripe.ts: for
 * a fully-onboarded seller, returns a one-shot Express Dashboard login
 * URL. Falls back to a fresh account_link if Stripe says onboarding
 * isn't actually complete (web has the same fallback).
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const user = await prisma.user.findUnique({
        where: { id: principal.id },
        select: { stripe_account_id: true },
    });
    if (!user?.stripe_account_id) {
        return apiError(
            "INVALID_INPUT",
            "Set up your Stripe payouts before opening the dashboard.",
        );
    }

    try {
        const loginLink = await stripe.accounts.createLoginLink(
            user.stripe_account_id,
        );
        return NextResponse.json({ url: loginLink.url });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("onboarding")) {
            const appUrl = await getAppUrl();
            const accountLink = await stripe.accountLinks.create({
                account: user.stripe_account_id,
                refresh_url: `${appUrl}/`,
                return_url: `${appUrl}/sell/onboarding-complete`,
                type: "account_onboarding",
            });
            return NextResponse.json({ url: accountLink.url });
        }
        // Standard/Platform account — direct them to the public dashboard.
        return NextResponse.json({ url: "https://dashboard.stripe.com" });
    }
}
