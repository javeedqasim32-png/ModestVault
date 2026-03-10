"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Creates a Stripe Connect onboarding link for the user.
 */
export async function onboardSellerAction() {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("You must be logged in to onboard as a seller.");
    }

    // 1. Get user from DB to check for existing stripe_account_id
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { stripe_account_id: true, email: true },
    });

    if (!user) throw new Error("User not found.");

    let stripeAccountId = user.stripe_account_id;

    // 2. Create Stripe account if it doesn't exist
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

        // Save to database
        await prisma.user.update({
            where: { id: session.user.id },
            data: { stripe_account_id: stripeAccountId },
        });
    }

    // 3. Create Account Link for onboarding
    const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${APP_URL}/sell`,
        return_url: `${APP_URL}/sell/onboarding-complete`,
        type: "account_onboarding",
    });

    return { url: accountLink.url };
}

/**
 * Checks the status of a Stripe account.
 */
export async function checkStripeAccountStatus(stripeAccountId: string) {
    try {
        const account = await stripe.accounts.retrieve(stripeAccountId);
        return {
            details_submitted: account.details_submitted,
            payouts_enabled: account.payouts_enabled,
            charges_enabled: account.charges_enabled,
        };
    } catch (error) {
        console.error("Error retrieving Stripe account:", error);
        return null;
    }
}

/**
 * Fetches the balance for a connected Stripe account.
 */
export async function getStripeBalance(stripeAccountId: string) {
    try {
        const balance = await stripe.balance.retrieve({
            stripeAccount: stripeAccountId,
        });

        // Sum up available and pending balances
        const available = balance.available.reduce((acc, curr) => acc + curr.amount, 0);
        const pending = balance.pending.reduce((acc, curr) => acc + curr.amount, 0);

        return {
            available: available / 100, // Convert cents to dollars
            pending: pending / 100,
            currency: balance.available[0]?.currency.toUpperCase() || "USD",
        };
    } catch (error) {
        console.error("Error fetching Stripe balance:", error);
        return { available: 0, pending: 0, currency: "USD" };
    }
}

/**
 * Generates a login link for the Stripe Express Dashboard.
 */
export async function createStripeDashboardLink() {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { stripe_account_id: true },
    });

    if (!user?.stripe_account_id) {
        throw new Error("No connected Stripe account found.");
    }

    try {
        const loginLink = await stripe.accounts.createLoginLink(user.stripe_account_id);
        return { url: loginLink.url };
    } catch (error: any) {
        console.error("Error creating Stripe login link, attempting fallback:", error.message);

        // Fallback 1: If account onboarding is incomplete
        if (error.message?.includes("onboarding")) {
            const accountLink = await stripe.accountLinks.create({
                account: user.stripe_account_id,
                refresh_url: `${APP_URL}/dashboard/earnings`,
                return_url: `${APP_URL}/dashboard/earnings`,
                type: "account_onboarding",
            });
            return { url: accountLink.url };
        }

        // Fallback 2: If it's a Standard account or Platform account (doesn't support login links)
        // We can check the account type or just redirect to the main Stripe dashboard
        if (error.message?.includes("Standard") || error.message?.includes("type")) {
            return { url: "https://dashboard.stripe.com" };
        }

        // Final fallback: If we can't do anything else, try to get them into their dashboard however we can
        return { url: "https://dashboard.stripe.com" };
    }
}
