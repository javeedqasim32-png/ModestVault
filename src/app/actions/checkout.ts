"use server";

import { auth } from "@/auth";
import { getAppUrl } from "@/lib/app-url";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import { getShipmentRateById, getShipmentRates } from "@/lib/shippo";
import { isStripeAccountReady } from "@/lib/stripe-connect";
import { stripe } from "@/lib/stripe";
import { normalizeUsPhoneInput } from "@/lib/phone";
import { hasCarrierPhoneLength } from "@/lib/phone";
import { redirect } from "next/navigation";

type ShippingAddressInput = {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone: string;
};

type SelectedRateInput = {
    rateId: string;
    carrier: string;
    serviceLevel: string;
    amount: string;
    currency: string;
    estimatedDays?: number;
    shipmentId?: string;
};

type AddressLike = {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postal_code: string;
    country: string;
};

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function normalizeShippingAddress(address: ShippingAddressInput): ShippingAddressInput {
    return {
        name: (address.name || "").trim(),
        line1: (address.line1 || "").trim(),
        line2: (address.line2 || "").trim(),
        city: (address.city || "").trim(),
        state: (address.state || "").trim(),
        postal_code: (address.postal_code || "").trim(),
        country: ((address.country || "US").trim() || "US").toUpperCase(),
        phone: normalizeUsPhoneInput(address.phone || ""),
    };
}

function assertShippingAddressIsComplete(address: ShippingAddressInput) {
    if (!address.name) throw new Error("Recipient full name is required.");
    if (!address.line1) throw new Error("Address line 1 is required.");
    if (!address.city) throw new Error("City is required.");
    if (!address.state) throw new Error("State is required.");
    if (!address.postal_code) throw new Error("Postal code is required.");
    if (!address.country) throw new Error("Country is required.");
    if (!address.phone) throw new Error("Phone number is required.");
    if (!hasCarrierPhoneLength(address.phone)) throw new Error("Phone number must contain between 8 and 15 digits.");
}

function getSellerOriginOrThrow(input: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    street1?: string | null;
    street2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    stripe_account_id?: string | null;
}) {
    const sellerName = `${input.first_name || ""} ${input.last_name || ""}`.trim() || "Seller";
    const sellerEmail = (input.email || "").trim();
    const normalizedPhone = normalizeUsPhoneInput(input.phone || "");

    if (!hasCarrierPhoneLength(normalizedPhone)) {
        throw new Error("Seller shipping profile is incomplete. Seller must add a valid phone number before shipping can continue.");
    }

    if (input.street1 && input.city && input.state && input.zip) {
        return {
            sellerName,
            sellerEmail,
            sellerPhone: normalizedPhone,
            sellerAddress: {
                line1: input.street1,
                line2: input.street2 || "",
                city: input.city,
                state: input.state,
                postal_code: input.zip,
                country: input.country || "US",
            } as AddressLike,
        };
    }

    throw new Error("Seller shipping profile is incomplete. Seller must add a full address before shipping can continue.");
}

async function getValidatedListingForCheckout(listingId: string, buyerId: string) {
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
                    first_name: true,
                    last_name: true,
                    email: true,
                    phone: true,
                    street1: true,
                    street2: true,
                    city: true,
                    state: true,
                    zip: true,
                    country: true,
                    stripe_account_id: true,
                    seller_enabled: true
                }
            }
        }
    });

    if (!listing) throw new Error("Listing not found.");
    if (listing.status !== "AVAILABLE") throw new Error("This item is no longer available.");
    if (!listing.user.stripe_account_id) throw new Error("Seller is not set up to receive payments.");
    if (listing.user_id === buyerId) throw new Error("You cannot buy your own listing.");

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

    return listing;
}

export async function createCheckoutSession(listingId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("You must be logged in to purchase an item.");
    }

    await getValidatedListingForCheckout(listingId, session.user.id);
    redirect(`/buy/checkout?listingId=${listingId}`);
}

export async function getShippingRatesForListing(listingId: string, address: ShippingAddressInput) {
    try {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Unauthorized");

        const listing = await getValidatedListingForCheckout(listingId, session.user.id);
        const seller = listing.user;

        const sellerOrigin = getSellerOriginOrThrow(seller);

        const normalizedAddress = normalizeShippingAddress(address);
        assertShippingAddressIsComplete(normalizedAddress);

        const ratesData = await getShipmentRates({
            buyerAddress: normalizedAddress,
            buyerName: normalizedAddress.name,
            buyerPhone: normalizedAddress.phone,
            sellerAddress: sellerOrigin.sellerAddress,
            sellerName: sellerOrigin.sellerName,
            sellerEmail: sellerOrigin.sellerEmail,
            sellerPhone: sellerOrigin.sellerPhone
        });

        return { success: true, shipmentId: ratesData.shipmentId, rates: ratesData.rates };
    } catch (error: unknown) {
        console.error("getShippingRatesForListing error:", error);
        return { error: getErrorMessage(error, "Failed to fetch shipping rates.") };
    }
}

export async function createCheckoutSessionWithShipping(
    listingId: string,
    address: ShippingAddressInput,
    selectedRate: SelectedRateInput
) {
    try {
        const session = await auth();
        const appUrl = await getAppUrl();
        if (!session?.user?.id) throw new Error("You must be logged in to purchase an item.");
        const normalizedAddress = normalizeShippingAddress(address);
        assertShippingAddressIsComplete(normalizedAddress);

        const listing = await getValidatedListingForCheckout(listingId, session.user.id);

        let validatedRate = null as null | {
            id: string;
            carrier: string;
            serviceLevel: string;
            amount: string;
            currency: string;
            estimatedDays?: number;
        };

        if (selectedRate.shipmentId) {
            validatedRate = await getShipmentRateById(selectedRate.shipmentId, selectedRate.rateId);
        }

        if (!validatedRate) {
            validatedRate = {
                id: selectedRate.rateId,
                carrier: selectedRate.carrier,
                serviceLevel: selectedRate.serviceLevel,
                amount: selectedRate.amount,
                currency: selectedRate.currency,
                estimatedDays: selectedRate.estimatedDays
            };
        }

        const shippingCents = Math.round(Number(validatedRate.amount) * 100);
        if (!Number.isFinite(shippingCents) || shippingCents < 0) throw new Error("Invalid shipping amount.");

        const unitAmount = Math.round(Number(listing.price) * 100);
        const itemPlatformFee = Math.round(unitAmount * 0.15); // 15% fee on item
        // Keep 100% of shipping on platform, while seller payout is based on item only.
        const feeAmount = itemPlatformFee + shippingCents;
        const coverImage = getPrimaryListingImage(listing, "detail");

        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: listing.title,
                            description: listing.description,
                            images: coverImage ? [coverImage.startsWith("http") ? coverImage : `${appUrl}${coverImage}`] : [],
                        },
                        unit_amount: unitAmount,
                    },
                    quantity: 1,
                },
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `Shipping - ${validatedRate.carrier}`,
                            description: validatedRate.serviceLevel,
                        },
                        unit_amount: shippingCents,
                    },
                    quantity: 1,
                }
            ],
            mode: "payment",
            payment_intent_data: {
                transfer_data: { destination: listing.user.stripe_account_id as string },
                application_fee_amount: feeAmount,
            },
            success_url: `${appUrl}/buy/success?session_id={CHECKOUT_SESSION_ID}&listingId=${listing.id}`,
            cancel_url: `${appUrl}/buy/checkout?listingId=${listing.id}`,
            customer_email: session.user.email ?? undefined,
            metadata: {
                listingId: listing.id,
                buyerId: session.user.id,
                itemAmountCents: String(unitAmount),
                shippingAmountCents: String(shippingCents),
                shippingRateId: validatedRate.id,
                shippingCarrier: validatedRate.carrier,
                shippingService: validatedRate.serviceLevel,
                shippingCurrency: validatedRate.currency,
                shippingEstimatedDays: String(validatedRate.estimatedDays ?? ""),
                shipName: normalizedAddress.name,
                shipLine1: normalizedAddress.line1,
                shipLine2: normalizedAddress.line2 || "",
                shipCity: normalizedAddress.city,
                shipState: normalizedAddress.state,
                shipPostal: normalizedAddress.postal_code,
                shipCountry: normalizedAddress.country,
                shipPhone: normalizedAddress.phone,
            }
        });

        if (!checkoutSession.url) throw new Error("Failed to create checkout session.");
        return { success: true, url: checkoutSession.url };
    } catch (error: unknown) {
        console.error("createCheckoutSessionWithShipping error:", error);
        return { error: getErrorMessage(error, "Failed to create checkout session.") };
    }
}
