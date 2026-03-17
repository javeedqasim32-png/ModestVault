"use server";

import { auth } from "@/auth";
import { getAppUrl } from "@/lib/app-url";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import { isStripeAccountReady } from "@/lib/stripe-connect";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";

/**
 * Creates a Stripe Checkout Session for a specific listing.
 * Uses Destination Charges to transfer funds to the seller.
 */
export async function createCheckoutSession(listingId: string) {
    const session = await auth();
    const appUrl = await getAppUrl();
    if (!session?.user?.id) {
        throw new Error("You must be logged in to purchase an item.");
    }

    // 1. Fetch the listing and include the seller's Stripe account info
    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
            user: {
                select: {
                    stripe_account_id: true,
                    seller_enabled: true
                }
            }
        }
    });

    if (!listing) throw new Error("Listing not found.");
    if (listing.status !== "AVAILABLE") throw new Error("This item is no longer available.");
    if (!listing.user.stripe_account_id) {
        throw new Error("Seller is not set up to receive payments.");
    }
    if (listing.user_id === session.user.id) {
        throw new Error("You cannot buy your own listing.");
    }

    const account = await stripe.accounts.retrieve(listing.user.stripe_account_id);
    const sellerReady = isStripeAccountReady(account);

    if (!sellerReady) {
        if (listing.user.seller_enabled) {
            await prisma.user.update({
                where: { id: listing.user_id },
                data: { seller_enabled: false },
            });
        }

        throw new Error("Seller is not currently eligible to receive payments.");
    }

    if (!listing.user.seller_enabled) {
        await prisma.user.update({
            where: { id: listing.user_id },
            data: { seller_enabled: true },
        });
    }

    const unitAmount = Math.round(Number(listing.price) * 100);
    const feeAmount = Math.round(unitAmount * 0.15); // 15% platform fee
    const coverImage = getPrimaryListingImage(listing, "detail");

    // 2. Create the Stripe Checkout Session
    // We use Destination Charges: the customer pays us, and we automatically transfer to the seller.
    const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
            {
                price_data: {
                    currency: "usd",
                    product_data: {
                        name: listing.title,
                        description: listing.description,
                        images: coverImage ? [coverImage.startsWith('http') ? coverImage : `${appUrl}${coverImage}`] : [],
                    },
                    unit_amount: unitAmount,
                },
                quantity: 1,
            },
        ],
        mode: "payment",
        payment_intent_data: {
            transfer_data: {
                destination: listing.user.stripe_account_id,
            },
            application_fee_amount: feeAmount,
        },
        success_url: `${appUrl}/buy/success?session_id={CHECKOUT_SESSION_ID}&listingId=${listing.id}`,
        cancel_url: `${appUrl}/listings/${listing.id}`,
        customer_email: session.user.email ?? undefined,
        metadata: {
            listingId: listing.id,
            buyerId: session.user.id
        }
    });

    if (!checkoutSession.url) {
        throw new Error("Failed to create checkout session.");
    }

    // Redirect to Stripe Checkout
    redirect(checkoutSession.url);
}
