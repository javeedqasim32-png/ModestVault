"use server";

import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { getAppUrl } from "@/lib/app-url";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import { getShipmentRateById, getShipmentRates } from "@/lib/shippo";
import { stripe } from "@/lib/stripe";
import { normalizeUsPhoneInput } from "@/lib/phone";
import { hasCarrierPhoneLength } from "@/lib/phone";
import { redirect } from "next/navigation";

const BUNDLE_MAX_ITEMS = 10;

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
                }
            }
        }
    });

    if (!listing) throw new Error("Listing not found.");
    if (listing.status !== "AVAILABLE") throw new Error("This item is no longer available.");
    if (listing.user_id === buyerId) throw new Error("You cannot buy your own listing.");

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
        const coverImage = getPrimaryListingImage(listing, "detail");

        // 1. Sync the address to the Stripe Customer so Tax can be calculated without second entry
        const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { stripe_customer_id: true, email: true, first_name: true, last_name: true }
        });

        let customerId = dbUser?.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: dbUser?.email || undefined,
                name: `${dbUser?.first_name || ""} ${dbUser?.last_name || ""}`.trim(),
            });
            customerId = customer.id;
            await prisma.user.update({
                where: { id: session.user.id },
                data: { stripe_customer_id: customerId }
            });
        }

        // Always update the customer address to our latest normalized address
        await stripe.customers.update(customerId, {
            shipping: {
                name: normalizedAddress.name,
                address: {
                    line1: normalizedAddress.line1,
                    line2: normalizedAddress.line2 || undefined,
                    city: normalizedAddress.city,
                    state: normalizedAddress.state,
                    postal_code: normalizedAddress.postal_code,
                    country: normalizedAddress.country,
                }
            },
            address: {
                line1: normalizedAddress.line1,
                line2: normalizedAddress.line2 || undefined,
                city: normalizedAddress.city,
                state: normalizedAddress.state,
                postal_code: normalizedAddress.postal_code,
                country: normalizedAddress.country,
            }
        });

        // Kill switch for Stripe Tax. Set STRIPE_AUTO_TAX_ENABLED=false in
        // .env to disable automatic tax calculation — useful when the platform
        // Stripe account is missing a head-office address and you want to
        // unblock end-to-end checkout testing without going to the dashboard.
        // Remove the env var (or set to "true") to re-enable. Buyers pay
        // pre-tax in the disabled state — don't ship with this off.
        const autoTaxEnabled = (process.env.STRIPE_AUTO_TAX_ENABLED ?? "true").toLowerCase() !== "false";
        const checkoutSession = await stripe.checkout.sessions.create({
            customer: customerId,
            automatic_tax: { enabled: autoTaxEnabled },
            // customer_update: "auto" requires automatic_tax to be enabled.
            // Skip the auto-update entirely when tax is disabled to avoid a
            // separate Stripe validation error.
            ...(autoTaxEnabled ? {
                customer_update: {
                    shipping: "auto",
                    address: "auto",
                },
            } : {}),
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
            success_url: `${appUrl}/buy/success?session_id={CHECKOUT_SESSION_ID}&listingId=${listing.id}`,
            cancel_url: `${appUrl}/buy/checkout?listingId=${listing.id}`,
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

// ---------- Bundle (same-seller multi-item) checkout ----------

/**
 * Validate a bundle of listings for checkout. All must be AVAILABLE, all from
 * the same seller, none owned by the buyer, and within the bundle size cap.
 * Returns the loaded listings (with seller fields) so callers don't re-fetch.
 */
async function getValidatedListingsForBundle(listingIds: string[], buyerId: string) {
    const uniqueIds = Array.from(new Set(listingIds.filter((id) => typeof id === "string" && id.length > 0)));
    if (uniqueIds.length < 2) throw new Error("A bundle needs at least 2 items.");
    if (uniqueIds.length > BUNDLE_MAX_ITEMS) {
        throw new Error(`Bundle is limited to ${BUNDLE_MAX_ITEMS} items per checkout. Please split your bundle.`);
    }

    const listings = await prisma.listing.findMany({
        where: { id: { in: uniqueIds } },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
            user: {
                select: {
                    id: true,
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
                },
            },
        },
    });

    if (listings.length !== uniqueIds.length) {
        throw new Error("One or more items in this bundle are no longer available.");
    }
    for (const listing of listings) {
        if (listing.status !== "AVAILABLE") {
            throw new Error("One or more items in this bundle are no longer available.");
        }
        if (listing.user_id === buyerId) {
            throw new Error("You cannot include your own listing in a bundle.");
        }
    }
    const sellerIds = new Set(listings.map((l) => l.user_id));
    if (sellerIds.size > 1) {
        throw new Error("All items in a bundle must be from the same seller.");
    }
    return listings;
}

/**
 * Cart-side entry point that always works regardless of group size:
 *   1 item from a seller → routes to the existing single-item checkout
 *   2+ items from a seller → routes to the bundle checkout
 * This lets the cart UI show one "Checkout All Items" button per seller
 * group without the caller having to know about single-vs-bundle plumbing.
 */
export async function createCheckoutForSellerGroup(listingIds: string[]) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("You must be logged in to purchase items.");
    }
    const uniqueIds = Array.from(new Set(listingIds.filter((id) => typeof id === "string" && id.length > 0)));
    if (uniqueIds.length === 0) {
        throw new Error("No items selected for checkout.");
    }
    if (uniqueIds.length === 1) {
        // Single-item path — validate then redirect to /buy/checkout?listingId=...
        await getValidatedListingForCheckout(uniqueIds[0], session.user.id);
        redirect(`/buy/checkout?listingId=${uniqueIds[0]}`);
    }
    // Bundle path — validate same-seller + availability, redirect with bundleIds.
    await getValidatedListingsForBundle(uniqueIds, session.user.id);
    redirect(`/buy/checkout?bundleIds=${encodeURIComponent(uniqueIds.join(","))}`);
}

/**
 * Entry from the cart's "Buy all from <seller>" button. Validates the bundle
 * then redirects to the checkout form with `bundleIds=...` so the standard
 * address + rate-selection flow can run for the whole batch.
 */
export async function createBundleCheckoutSession(listingIds: string[]) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("You must be logged in to purchase items.");
    }
    await getValidatedListingsForBundle(listingIds, session.user.id);
    const idsParam = encodeURIComponent(listingIds.join(","));
    redirect(`/buy/checkout?bundleIds=${idsParam}`);
}

/**
 * Get Shippo rates for a same-seller bundle. One call, one parcel for the
 * whole group. v1 uses the existing STANDARD_PARCEL size — clothing is
 * compressible and typical 2-5 item bundles fit. Future: sum per-item dims.
 */
export async function getShippingRatesForBundle(listingIds: string[], address: ShippingAddressInput) {
    try {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Unauthorized");

        const listings = await getValidatedListingsForBundle(listingIds, session.user.id);
        const sellerOrigin = getSellerOriginOrThrow(listings[0].user);

        const normalizedAddress = normalizeShippingAddress(address);
        assertShippingAddressIsComplete(normalizedAddress);

        const ratesData = await getShipmentRates({
            buyerAddress: normalizedAddress,
            buyerName: normalizedAddress.name,
            buyerPhone: normalizedAddress.phone,
            sellerAddress: sellerOrigin.sellerAddress,
            sellerName: sellerOrigin.sellerName,
            sellerEmail: sellerOrigin.sellerEmail,
            sellerPhone: sellerOrigin.sellerPhone,
        });

        return { success: true, shipmentId: ratesData.shipmentId, rates: ratesData.rates };
    } catch (error: unknown) {
        console.error("getShippingRatesForBundle error:", error);
        return { error: getErrorMessage(error, "Failed to fetch shipping rates for the bundle.") };
    }
}

/**
 * Create the Stripe session for a same-seller bundle. N item line_items + 1
 * shipping line_item. Metadata carries `listingIds` (comma-separated) and a
 * pre-generated `batchId` so the success page can deterministically attach
 * the same batch_id to every Order it creates.
 */
export async function createBundledCheckoutSessionWithShipping(
    listingIds: string[],
    address: ShippingAddressInput,
    selectedRate: SelectedRateInput
) {
    try {
        const session = await auth();
        const appUrl = await getAppUrl();
        if (!session?.user?.id) throw new Error("You must be logged in to purchase items.");

        const normalizedAddress = normalizeShippingAddress(address);
        assertShippingAddressIsComplete(normalizedAddress);

        const listings = await getValidatedListingsForBundle(listingIds, session.user.id);
        const seller = listings[0].user;

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
                estimatedDays: selectedRate.estimatedDays,
            };
        }

        const shippingCents = Math.round(Number(validatedRate.amount) * 100);
        if (!Number.isFinite(shippingCents) || shippingCents < 0) throw new Error("Invalid shipping amount.");

        // Sync the address to the Stripe Customer (same pattern as single-item path).
        const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { stripe_customer_id: true, email: true, first_name: true, last_name: true },
        });

        let customerId = dbUser?.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: dbUser?.email || undefined,
                name: `${dbUser?.first_name || ""} ${dbUser?.last_name || ""}`.trim(),
            });
            customerId = customer.id;
            await prisma.user.update({
                where: { id: session.user.id },
                data: { stripe_customer_id: customerId },
            });
        }

        await stripe.customers.update(customerId, {
            shipping: {
                name: normalizedAddress.name,
                address: {
                    line1: normalizedAddress.line1,
                    line2: normalizedAddress.line2 || undefined,
                    city: normalizedAddress.city,
                    state: normalizedAddress.state,
                    postal_code: normalizedAddress.postal_code,
                    country: normalizedAddress.country,
                },
            },
            address: {
                line1: normalizedAddress.line1,
                line2: normalizedAddress.line2 || undefined,
                city: normalizedAddress.city,
                state: normalizedAddress.state,
                postal_code: normalizedAddress.postal_code,
                country: normalizedAddress.country,
            },
        });

        const batchId = randomUUID();
        const itemLineItems = listings.map((listing) => {
            const coverImage = getPrimaryListingImage(listing, "detail");
            return {
                price_data: {
                    currency: "usd" as const,
                    product_data: {
                        name: listing.title,
                        description: listing.description ?? undefined,
                        images: coverImage ? [coverImage.startsWith("http") ? coverImage : `${appUrl}${coverImage}`] : [],
                    },
                    unit_amount: Math.round(Number(listing.price) * 100),
                },
                quantity: 1,
            };
        });

        // Same kill switch as the single-item path. See createCheckoutSessionWithShipping
        // for the full reasoning. One env var controls both checkout flows.
        const autoTaxEnabled = (process.env.STRIPE_AUTO_TAX_ENABLED ?? "true").toLowerCase() !== "false";
        const checkoutSession = await stripe.checkout.sessions.create({
            customer: customerId,
            automatic_tax: { enabled: autoTaxEnabled },
            ...(autoTaxEnabled ? { customer_update: { shipping: "auto", address: "auto" } } : {}),
            payment_method_types: ["card"],
            line_items: [
                ...itemLineItems,
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `Shipping - ${validatedRate.carrier} (1 package, ${listings.length} items)`,
                            description: validatedRate.serviceLevel,
                        },
                        unit_amount: shippingCents,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: `${appUrl}/buy/success?session_id={CHECKOUT_SESSION_ID}&bundleId=${batchId}`,
            cancel_url: `${appUrl}/buy/checkout?bundleIds=${encodeURIComponent(listingIds.join(","))}`,
            metadata: {
                // Bundle marker — success page branches on listingIds presence.
                listingIds: listingIds.join(","),
                batchId,
                sellerId: seller.id,
                buyerId: session.user.id,
                itemAmountCentsTotal: String(itemLineItems.reduce((sum, li) => sum + (li.price_data.unit_amount || 0), 0)),
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
            },
        });

        if (!checkoutSession.url) throw new Error("Failed to create checkout session.");
        return { success: true, url: checkoutSession.url };
    } catch (error: unknown) {
        console.error("createBundledCheckoutSessionWithShipping error:", error);
        return { error: getErrorMessage(error, "Failed to create bundled checkout session.") };
    }
}
