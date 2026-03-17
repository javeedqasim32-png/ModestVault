import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isStripeAccountReady } from "@/lib/stripe-connect";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Home, RefreshCcw } from "lucide-react";

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

    const isReady = isStripeAccountReady(account);

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

    const dueFields = account.requirements?.currently_due ?? [];

    return (
        <div className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-3xl items-center justify-center">
                <div className="w-full rounded-[2rem] border border-border/80 bg-card p-6 shadow-[0_24px_60px_rgba(114,86,67,0.08)] sm:p-8">
                    {isReady ? (
                        <>
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-700">
                                <CheckCircle2 className="h-10 w-10" />
                            </div>
                            <div className="mt-6 text-center">
                                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Stripe connected</p>
                                <h1 className="mt-3 font-serif text-4xl text-foreground">Seller account active</h1>
                                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                                    Your Stripe Connect account is fully set up. You can now create listings and receive payouts.
                                </p>
                            </div>
                            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                                <Link
                                    href="/sell"
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm uppercase tracking-[0.24em] text-primary-foreground hover:opacity-90"
                                >
                                    Create listing
                                </Link>
                                <Link
                                    href="/"
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm uppercase tracking-[0.24em] text-foreground hover:bg-background"
                                >
                                    <Home className="h-4 w-4" />
                                    Home
                                </Link>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <AlertCircle className="h-10 w-10" />
                            </div>
                            <div className="mt-6 text-center">
                                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Onboarding incomplete</p>
                                <h1 className="mt-3 font-serif text-4xl text-foreground">Stripe needs more details</h1>
                                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                                    Your seller account is not active yet. Stripe still requires a few details before you can receive payouts.
                                </p>
                            </div>

                            {dueFields.length > 0 ? (
                                <div className="mt-8 rounded-[1.5rem] border border-border/80 bg-[linear-gradient(180deg,#fbf7f4_0%,#f3e9e2_100%)] p-5">
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Still required</p>
                                    <ul className="mt-4 space-y-2 text-sm text-foreground">
                                        {dueFields.slice(0, 8).map((field) => (
                                            <li key={field} className="rounded-full bg-white/70 px-4 py-2">
                                                {field}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                                <Link
                                    href="/sell"
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm uppercase tracking-[0.24em] text-primary-foreground hover:opacity-90"
                                >
                                    <RefreshCcw className="h-4 w-4" />
                                    Retry onboarding
                                </Link>
                                <Link
                                    href="/"
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm uppercase tracking-[0.24em] text-foreground hover:bg-background"
                                >
                                    <Home className="h-4 w-4" />
                                    Home
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
