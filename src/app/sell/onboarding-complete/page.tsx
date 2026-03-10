import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OnboardingCompletePage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }

    // 1. Fetch user to get stripe_account_id
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { stripe_account_id: true }
    });

    if (!user?.stripe_account_id) {
        redirect("/sell");
    }

    // 2. Retrieve account from Stripe to check status
    const account = await stripe.accounts.retrieve(user.stripe_account_id);

    // Check if we are in test mode
    const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");

    console.log("Stripe Onboarding Check:", {
        id: account.id,
        details_submitted: account.details_submitted,
        payouts_enabled: account.payouts_enabled,
        isTestMode,
        eventually_due: account.requirements?.eventually_due
    });

    // Check for specific capabilities required for destination charges
    const hasTransfers = account.capabilities?.transfers === "active";
    const hasPayments = account.capabilities?.card_payments === "active";

    // ABSOLUTELY STRICT: Must have details submitted, payouts enabled, AND active capabilities.
    // If any of these are missing, the user is NOT ready to sell.
    const isReady = account.details_submitted &&
        account.payouts_enabled &&
        hasTransfers &&
        hasPayments;

    if (isReady) {
        // Update database only when Stripe confirms FULL readiness
        await prisma.user.update({
            where: { id: session.user.id },
            data: { seller_enabled: true }
        });
    } else {
        // If they were previously enabled but now fail the strict check, disable them
        await prisma.user.update({
            where: { id: session.user.id },
            data: { seller_enabled: false }
        });
    }

    return (
        <div className="container mx-auto px-4 py-16 flex justify-center min-h-[calc(100vh-64px)]">
            <div className="max-w-md w-full text-center">
                {isReady ? (
                    <>
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                            <CheckCircle2 className="w-12 h-12" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-neutral-900 mb-4">Seller Account Active!</h1>
                        <p className="text-neutral-600 mb-8">
                            Your Stripe Connect account is successfully setup. You can now start listing items and receiving payouts.
                        </p>
                        <Link
                            href="/sell"
                            className="block w-full py-4 bg-neutral-900 text-white rounded-full font-bold hover:bg-neutral-800 transition-colors"
                        >
                            Create Your First Listing
                        </Link>
                    </>
                ) : (
                    <>
                        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-600">
                            <AlertCircle className="w-12 h-12" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-neutral-900 mb-4">Onboarding Incomplete</h1>
                        <p className="text-neutral-600 mb-8">
                            It looks like you haven't finished setting up your Stripe account details yet. Stripe needs this to process your payouts safely.
                        </p>
                        <Link
                            href="/sell"
                            className="block w-full py-4 bg-neutral-900 text-white rounded-full font-bold hover:bg-neutral-800 transition-colors"
                        >
                            Try Connecting Again
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
