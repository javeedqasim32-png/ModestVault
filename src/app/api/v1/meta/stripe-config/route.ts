import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/stripe-config
 *
 * Returns the Stripe publishable key the mobile client needs to
 * initialize the Stripe SDK and present PaymentSheet. The publishable
 * key is safe to expose (Stripe designed it that way); never return
 * the secret key here.
 *
 * The Apple Pay merchant identifier is optional — only required if
 * we ship Apple Pay support. Leaving null lets the client skip the
 * Apple Pay button without erroring.
 *
 * Returns 503 (with a helpful message) when STRIPE_PUBLISHABLE_KEY
 * isn't configured, so the Flutter app can render a "checkout
 * temporarily unavailable" state instead of crashing on a missing key.
 */
export async function GET() {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
        return apiError(
            "UNAVAILABLE",
            "Checkout is not configured on this server. Ask an admin to set STRIPE_PUBLISHABLE_KEY.",
        );
    }
    return NextResponse.json({
        publishableKey,
        merchantIdentifier: process.env.APPLE_PAY_MERCHANT_ID ?? null,
    });
}
