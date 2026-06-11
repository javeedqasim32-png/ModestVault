import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { purchaseLabel } from "@/lib/shippo";
import { sendOrderConfirmationEmail, sendSaleNotificationEmail } from "@/lib/email";
import { createNotification } from "@/app/actions/notifications";

// Result returned by `finalizeCheckout`. Callers (the /buy/success page and the
// Stripe webhook) branch on `status` to decide what to do next. The actual
// order rows / label-error state needed by the success-page UI are included
// when relevant so the page can stay a thin renderer.
export type FinalizeResult =
    | {
        status: "FINALIZED" | "ALREADY_FINALIZED";
        isBundle: boolean;
        // Single-item path: the (possibly relabel-updated) Order with includes.
        order?: any;
        autoLabelError?: string | null;
        // Bundle path: every sibling Order with includes.
        bundleOrders?: any[];
        bundleAutoLabelError?: string | null;
        batchId?: string;
    }
    | { status: "NOT_PAID"; paymentStatus: string }
    | { status: "ALREADY_SOLD"; isBundle: boolean }
    | { status: "MISSING_LISTING" };

const ORDER_WITH_DETAILS_INCLUDE = {
    purchase: { include: { listing: { include: { user: true } } } },
} as const;

/**
 * Finalize a paid Stripe Checkout session — create Purchase + Order rows,
 * mark listings SOLD, buy the Shippo label, send emails, fire notifications.
 *
 * Called from TWO places:
 *  - `/buy/success` (after Stripe redirects the buyer back)
 *  - `POST /api/webhooks/stripe` (server-to-server `checkout.session.completed`)
 *
 * Idempotent on `Purchase.stripe_session_id` (unique constraint in the schema):
 * if a Purchase already exists for this session, we no-op the creation and
 * return `ALREADY_FINALIZED`. If two callers race (both find no existing row
 * and both try to create), Postgres serializes the inserts and the loser
 * catches `P2002` and resolves to `ALREADY_FINALIZED`. No duplicate orders,
 * no double Shippo label purchase.
 */
export async function finalizeCheckout(sessionId: string): Promise<FinalizeResult> {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    const paymentIntentId =
        typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id || null;
    const metadata = (checkoutSession.metadata || {}) as Record<string, string>;

    // We use metadata.buyerId rather than NextAuth's session because this
    // helper is also called from the webhook context, which has no session.
    // Both paths get the same value (set at checkout-session-create time).
    const buyerId = metadata.buyerId || "";

    // Gate on payment_status — also short-circuits when the webhook fires for a
    // slow-settling payment that hasn't cleared yet. Stripe will retry the
    // webhook (or send an async_payment_succeeded event later) so returning
    // NOT_PAID here is safe.
    if (checkoutSession.payment_status !== "paid") {
        return { status: "NOT_PAID", paymentStatus: String(checkoutSession.payment_status) };
    }

    const shippingAddressFromMeta = metadata.shipLine1
        ? {
            name: metadata.shipName || "",
            line1: metadata.shipLine1 || "",
            line2: metadata.shipLine2 || "",
            city: metadata.shipCity || "",
            state: metadata.shipState || "",
            postal_code: metadata.shipPostal || "",
            country: metadata.shipCountry || "US",
            phone: metadata.shipPhone || "",
        }
        : null;
    const shippingOptionSelectedInCheckout = !!metadata.shippingRateId;

    const bundleListingIds = (metadata.listingIds || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const isBundle = bundleListingIds.length >= 2;

    // ────────────────────────────────────────────────────────────────────
    // BUNDLE PATH
    // ────────────────────────────────────────────────────────────────────
    if (isBundle) {
        const batchIdFromMeta = metadata.batchId || "";

        // Idempotency: if any Order with this batch_id exists, we've already
        // finalized this checkout (either via a prior success-page visit or via
        // the webhook firing earlier).
        const existingBundle = await (prisma as any).order.findMany({
            where: { batch_id: batchIdFromMeta },
            include: ORDER_WITH_DETAILS_INCLUDE,
        });

        if (existingBundle.length > 0) {
            // Still try the label purchase below (idempotent on label_url existence).
            const labelOutcome = await maybePurchaseBundleLabel(batchIdFromMeta, existingBundle);
            return {
                status: "ALREADY_FINALIZED",
                isBundle: true,
                bundleOrders: labelOutcome.bundleOrders,
                bundleAutoLabelError: labelOutcome.error,
                batchId: batchIdFromMeta,
            };
        }

        const listingsForBundle = await prisma.listing.findMany({
            where: { id: { in: bundleListingIds } },
            include: { user: true },
        });

        try {
            await prisma.$transaction(async (tx) => {
                const currentListings = await tx.listing.findMany({
                    where: { id: { in: bundleListingIds } },
                });
                if (
                    currentListings.length !== bundleListingIds.length ||
                    currentListings.some((l) => l.status !== "AVAILABLE")
                ) {
                    throw new Error("ALREADY_SOLD");
                }

                await tx.listing.updateMany({
                    where: { id: { in: bundleListingIds } },
                    data: { status: "SOLD" },
                });

                const totalShippingCents = Number(metadata.shippingAmountCents || "0") || 0;
                const sellerTransferCurrency = (checkoutSession.currency || "usd").toLowerCase();

                for (let i = 0; i < bundleListingIds.length; i++) {
                    const lid = bundleListingIds[i];
                    const lst = currentListings.find((l) => l.id === lid)!;
                    const itemCents = Math.round(Number(lst.price) * 100);

                    const newPurchase = await tx.purchase.create({
                        data: {
                            buyer_id: buyerId,
                            listing_id: lid,
                            amount: itemCents / 100,
                            stripe_session_id: sessionId,
                            payment_intent_id: paymentIntentId,
                        },
                    });

                    const sellerTransferAmountCents = Math.max(0, Math.round(itemCents * 0.85));
                    const orderShippingAmount =
                        i === 0 ? (totalShippingCents / 100).toFixed(2) : "0.00";

                    await (tx as any).order.create({
                        data: {
                            purchase_id: newPurchase.id,
                            batch_id: batchIdFromMeta,
                            order_status: "PAID",
                            shipping_status: "NOT_SHIPPED",
                            shipping_stage: shippingOptionSelectedInCheckout
                                ? "OPTION_SELECTED"
                                : (shippingAddressFromMeta ? "ADDRESS_SET" : "ADDRESS_MISSING"),
                            shipping_address: shippingAddressFromMeta || undefined,
                            shipping_option_rate_id: i === 0 ? (metadata.shippingRateId || undefined) : undefined,
                            shipping_option_carrier: i === 0 ? (metadata.shippingCarrier || undefined) : undefined,
                            shipping_option_service: i === 0 ? (metadata.shippingService || undefined) : undefined,
                            shipping_option_amount: orderShippingAmount,
                            shipping_option_currency: i === 0 ? (metadata.shippingCurrency || undefined) : undefined,
                            shipping_option_selected_at: i === 0 && shippingOptionSelectedInCheckout ? new Date() : undefined,
                            seller_transfer_status: "PENDING_HOLD",
                            seller_transfer_amount_cents: sellerTransferAmountCents,
                            seller_transfer_currency: sellerTransferCurrency,
                        },
                    });
                }

                if (buyerId) {
                    await tx.cartItem.deleteMany({
                        where: {
                            user_id: buyerId,
                            listing_id: { in: bundleListingIds },
                        },
                    });
                }
            });
        } catch (error: any) {
            if (error?.message === "ALREADY_SOLD") {
                return { status: "ALREADY_SOLD", isBundle: true };
            }
            // P2002 = unique constraint violation on stripe_session_id, which
            // means a concurrent caller (webhook + success page race) created
            // the bundle first. Re-read and treat as ALREADY_FINALIZED.
            if (error?.code === "P2002") {
                const racedBundle = await (prisma as any).order.findMany({
                    where: { batch_id: batchIdFromMeta },
                    include: ORDER_WITH_DETAILS_INCLUDE,
                });
                const labelOutcome = await maybePurchaseBundleLabel(batchIdFromMeta, racedBundle);
                return {
                    status: "ALREADY_FINALIZED",
                    isBundle: true,
                    bundleOrders: labelOutcome.bundleOrders,
                    bundleAutoLabelError: labelOutcome.error,
                    batchId: batchIdFromMeta,
                };
            }
            throw error;
        }

        // Post-creation: buyer summary email, then per-item seller emails + notifications.
        const buyerEmail = checkoutSession.customer_details?.email;
        if (buyerEmail) {
            const summaryTitle = listingsForBundle.length > 0
                ? `${listingsForBundle.length} items from ${listingsForBundle[0].user.first_name} ${listingsForBundle[0].user.last_name}`
                : "your order";
            await sendOrderConfirmationEmail(
                buyerEmail,
                summaryTitle,
                (checkoutSession.amount_total || 0) / 100,
            );
        }
        for (const lst of listingsForBundle) {
            if (lst.user.email) {
                await sendSaleNotificationEmail(
                    lst.user.email,
                    lst.title,
                    Number(lst.price),
                    { needsStripeConnect: !lst.user.stripe_account_id },
                );
            }
            await createNotification({
                userId: lst.user.id,
                type: "ITEM_SOLD",
                title: `Your item sold: ${lst.title}`,
                body: `Sold for $${Number(lst.price).toFixed(2)} — ship soon to keep your buyer happy.`,
                linkUrl: "/dashboard/sales",
            });
        }

        const freshBundle = await (prisma as any).order.findMany({
            where: { batch_id: batchIdFromMeta },
            include: ORDER_WITH_DETAILS_INCLUDE,
        });
        const labelOutcome = await maybePurchaseBundleLabel(batchIdFromMeta, freshBundle);

        return {
            status: "FINALIZED",
            isBundle: true,
            bundleOrders: labelOutcome.bundleOrders,
            bundleAutoLabelError: labelOutcome.error,
            batchId: batchIdFromMeta,
        };
    }

    // ────────────────────────────────────────────────────────────────────
    // SINGLE-ITEM PATH
    // ────────────────────────────────────────────────────────────────────
    const listingId = metadata.listingId;
    if (!listingId) {
        return { status: "MISSING_LISTING" };
    }

    let order = await (prisma as any).order.findFirst({
        where: { purchase: { stripe_session_id: sessionId } },
        include: ORDER_WITH_DETAILS_INCLUDE,
    });

    let newlyCreated = false;
    if (!order) {
        const listing = await prisma.listing.findUnique({
            where: { id: listingId },
            include: { user: true },
        });
        if (!listing) {
            return { status: "MISSING_LISTING" };
        }

        try {
            await prisma.$transaction(async (tx) => {
                const currentListing = await tx.listing.findUnique({ where: { id: listingId } });
                if (!currentListing || currentListing.status !== "AVAILABLE") {
                    throw new Error("ALREADY_SOLD");
                }

                await tx.listing.update({
                    where: { id: listingId },
                    data: { status: "SOLD" },
                });

                const newPurchase = await tx.purchase.create({
                    data: {
                        buyer_id: buyerId,
                        listing_id: listingId,
                        amount: metadata.itemAmountCents
                            ? Number(metadata.itemAmountCents) / 100
                            : (checkoutSession.amount_total || 0) / 100,
                        stripe_session_id: sessionId,
                        payment_intent_id: paymentIntentId,
                    },
                });

                const itemAmountCents = metadata.itemAmountCents
                    ? Number(metadata.itemAmountCents)
                    : Math.round(checkoutSession.amount_total || 0);
                const sellerTransferAmountCents = Math.max(0, Math.round(itemAmountCents * 0.85));
                const sellerTransferCurrency = (checkoutSession.currency || "usd").toLowerCase();

                order = await (tx as any).order.create({
                    data: {
                        purchase_id: newPurchase.id,
                        order_status: "PAID",
                        shipping_status: "NOT_SHIPPED",
                        shipping_stage: shippingOptionSelectedInCheckout
                            ? "OPTION_SELECTED"
                            : (shippingAddressFromMeta ? "ADDRESS_SET" : "ADDRESS_MISSING"),
                        shipping_address: shippingAddressFromMeta || undefined,
                        shipping_option_rate_id: metadata.shippingRateId || undefined,
                        shipping_option_carrier: metadata.shippingCarrier || undefined,
                        shipping_option_service: metadata.shippingService || undefined,
                        shipping_option_amount: metadata.shippingAmountCents
                            ? (Number(metadata.shippingAmountCents) / 100).toFixed(2)
                            : undefined,
                        shipping_option_currency: metadata.shippingCurrency || undefined,
                        shipping_option_selected_at: shippingOptionSelectedInCheckout ? new Date() : undefined,
                        seller_transfer_status: "PENDING_HOLD",
                        seller_transfer_amount_cents: sellerTransferAmountCents,
                        seller_transfer_currency: sellerTransferCurrency,
                    },
                    include: ORDER_WITH_DETAILS_INCLUDE,
                });

                if (buyerId) {
                    await tx.cartItem.deleteMany({
                        where: { user_id: buyerId, listing_id: listingId },
                    });
                }
            });
            newlyCreated = true;
        } catch (error: any) {
            if (error?.message === "ALREADY_SOLD") {
                return { status: "ALREADY_SOLD", isBundle: false };
            }
            // Concurrent caller won the race.
            if (error?.code === "P2002") {
                const raced = await (prisma as any).order.findFirst({
                    where: { purchase: { stripe_session_id: sessionId } },
                    include: ORDER_WITH_DETAILS_INCLUDE,
                });
                if (raced) {
                    const labelOutcome = await maybePurchaseSingleLabel(raced);
                    return {
                        status: "ALREADY_FINALIZED",
                        isBundle: false,
                        order: labelOutcome.order,
                        autoLabelError: labelOutcome.error,
                    };
                }
            }
            throw error;
        }

        // Buyer + seller emails + seller notification (only fires when we
        // actually created the order, not when a race winner already did it).
        const buyerEmail = checkoutSession.customer_details?.email;
        if (buyerEmail) {
            await sendOrderConfirmationEmail(
                buyerEmail,
                listing.title,
                (checkoutSession.amount_total || 0) / 100,
            );
        }
        if (listing.user.email) {
            await sendSaleNotificationEmail(
                listing.user.email,
                listing.title,
                Number(listing.price),
                { needsStripeConnect: !listing.user.stripe_account_id },
            );
        }
        await createNotification({
            userId: listing.user.id,
            type: "ITEM_SOLD",
            title: `Your item sold: ${listing.title}`,
            body: `Sold for $${Number(listing.price).toFixed(2)} — ship soon to keep your buyer happy.`,
            linkUrl: "/dashboard/sales",
        });
    }

    // Idempotent cart cleanup — safe to run regardless of whether we just
    // created the order or it pre-existed (a re-visit by the same buyer).
    if (buyerId) {
        await prisma.cartItem.deleteMany({
            where: { user_id: buyerId, listing_id: listingId },
        });
    }

    const labelOutcome = await maybePurchaseSingleLabel(order);

    return {
        status: newlyCreated ? "FINALIZED" : "ALREADY_FINALIZED",
        isBundle: false,
        order: labelOutcome.order,
        autoLabelError: labelOutcome.error,
    };
}

/**
 * Mobile (PaymentSheet) sibling of finalizeCheckout. Keyed off the
 * PaymentIntent id instead of a Checkout Session id, because the mobile flow
 * never creates a Checkout Session. Logic mirrors finalizeCheckout's
 * single-item path step-for-step — DB upsert under the composite unique on
 * (payment_intent_id, listing_id), label purchase, buyer/seller emails,
 * seller notification. The race-safe P2002 dance is the same; we just check
 * for an existing Purchase by payment_intent_id rather than stripe_session_id.
 *
 * Called from two places:
 *  - POST /api/v1/checkout/finalize  (mobile client confirms payment success)
 *  - The payment_intent.succeeded handler in /api/webhooks/stripe (backup)
 *
 * Bundle checkouts are deferred for the mobile flow — the website still
 * routes those through Hosted Checkout.
 *
 * KNOWN DUPLICATION: this and finalizeCheckout share ~80% of the body. The
 * two will be merged behind a single _finalizeCheckoutCore() once both paths
 * have run in prod long enough to validate they produce byte-identical
 * Order rows. Don't add divergent logic to either without porting to both.
 */
export async function finalizeCheckoutByPaymentIntent(paymentIntentId: string): Promise<FinalizeResult> {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = (paymentIntent.metadata || {}) as Record<string, string>;
    const buyerId = metadata.buyerId || "";

    if (paymentIntent.status !== "succeeded") {
        return { status: "NOT_PAID", paymentStatus: String(paymentIntent.status) };
    }

    const listingId = metadata.listingId;
    if (!listingId) {
        return { status: "MISSING_LISTING" };
    }

    const shippingAddressFromMeta = metadata.shipLine1
        ? {
            name: metadata.shipName || "",
            line1: metadata.shipLine1 || "",
            line2: metadata.shipLine2 || "",
            city: metadata.shipCity || "",
            state: metadata.shipState || "",
            postal_code: metadata.shipPostal || "",
            country: metadata.shipCountry || "US",
            phone: metadata.shipPhone || "",
        }
        : null;
    const shippingOptionSelectedInCheckout = !!metadata.shippingRateId;

    let order = await (prisma as any).order.findFirst({
        where: { purchase: { payment_intent_id: paymentIntentId, listing_id: listingId } },
        include: ORDER_WITH_DETAILS_INCLUDE,
    });

    let newlyCreated = false;
    if (!order) {
        const listing = await prisma.listing.findUnique({
            where: { id: listingId },
            include: { user: true },
        });
        if (!listing) {
            return { status: "MISSING_LISTING" };
        }

        try {
            await prisma.$transaction(async (tx) => {
                const currentListing = await tx.listing.findUnique({ where: { id: listingId } });
                if (!currentListing || currentListing.status !== "AVAILABLE") {
                    throw new Error("ALREADY_SOLD");
                }

                await tx.listing.update({
                    where: { id: listingId },
                    data: { status: "SOLD" },
                });

                const itemAmountCents = metadata.itemAmountCents
                    ? Number(metadata.itemAmountCents)
                    : Math.round(paymentIntent.amount || 0);
                const sellerTransferAmountCents = Math.max(0, Math.round(itemAmountCents * 0.85));
                const sellerTransferCurrency = (paymentIntent.currency || "usd").toLowerCase();

                const newPurchase = await tx.purchase.create({
                    data: {
                        buyer_id: buyerId,
                        listing_id: listingId,
                        amount: itemAmountCents / 100,
                        // No stripe_session_id for mobile — composite unique
                        // on (payment_intent_id, listing_id) provides
                        // idempotency.
                        stripe_session_id: null,
                        payment_intent_id: paymentIntentId,
                    },
                });

                order = await (tx as any).order.create({
                    data: {
                        purchase_id: newPurchase.id,
                        order_status: "PAID",
                        shipping_status: "NOT_SHIPPED",
                        shipping_stage: shippingOptionSelectedInCheckout
                            ? "OPTION_SELECTED"
                            : (shippingAddressFromMeta ? "ADDRESS_SET" : "ADDRESS_MISSING"),
                        shipping_address: shippingAddressFromMeta || undefined,
                        shipping_option_rate_id: metadata.shippingRateId || undefined,
                        shipping_option_carrier: metadata.shippingCarrier || undefined,
                        shipping_option_service: metadata.shippingService || undefined,
                        shipping_option_amount: metadata.shippingAmountCents
                            ? (Number(metadata.shippingAmountCents) / 100).toFixed(2)
                            : undefined,
                        shipping_option_currency: metadata.shippingCurrency || undefined,
                        shipping_option_selected_at: shippingOptionSelectedInCheckout ? new Date() : undefined,
                        seller_transfer_status: "PENDING_HOLD",
                        seller_transfer_amount_cents: sellerTransferAmountCents,
                        seller_transfer_currency: sellerTransferCurrency,
                    },
                    include: ORDER_WITH_DETAILS_INCLUDE,
                });

                if (buyerId) {
                    await tx.cartItem.deleteMany({
                        where: { user_id: buyerId, listing_id: listingId },
                    });
                }
            });
            newlyCreated = true;
        } catch (error: any) {
            if (error?.message === "ALREADY_SOLD") {
                return { status: "ALREADY_SOLD", isBundle: false };
            }
            // P2002 on (payment_intent_id, listing_id) — the webhook + the
            // mobile client's explicit finalize raced. Re-read and treat as
            // ALREADY_FINALIZED.
            if (error?.code === "P2002") {
                const raced = await (prisma as any).order.findFirst({
                    where: { purchase: { payment_intent_id: paymentIntentId, listing_id: listingId } },
                    include: ORDER_WITH_DETAILS_INCLUDE,
                });
                if (raced) {
                    const labelOutcome = await maybePurchaseSingleLabel(raced);
                    return {
                        status: "ALREADY_FINALIZED",
                        isBundle: false,
                        order: labelOutcome.order,
                        autoLabelError: labelOutcome.error,
                    };
                }
            }
            throw error;
        }

        // Emails + seller notification. Buyer email comes from the User row
        // since PaymentIntents don't carry customer_details the way Sessions
        // do (the cookie redirect path's checkoutSession.customer_details
        // shape isn't populated on raw PaymentIntents).
        const buyer = buyerId
            ? await prisma.user.findUnique({ where: { id: buyerId }, select: { email: true } })
            : null;
        if (buyer?.email) {
            await sendOrderConfirmationEmail(
                buyer.email,
                listing.title,
                (paymentIntent.amount || 0) / 100,
            );
        }
        if (listing.user.email) {
            await sendSaleNotificationEmail(
                listing.user.email,
                listing.title,
                Number(listing.price),
                { needsStripeConnect: !listing.user.stripe_account_id },
            );
        }
        await createNotification({
            userId: listing.user.id,
            type: "ITEM_SOLD",
            title: `Your item sold: ${listing.title}`,
            body: `Sold for $${Number(listing.price).toFixed(2)} — ship soon to keep your buyer happy.`,
            linkUrl: "/dashboard/sales",
        });
    }

    if (buyerId) {
        await prisma.cartItem.deleteMany({
            where: { user_id: buyerId, listing_id: listingId },
        });
    }

    const labelOutcome = await maybePurchaseSingleLabel(order);

    return {
        status: newlyCreated ? "FINALIZED" : "ALREADY_FINALIZED",
        isBundle: false,
        order: labelOutcome.order,
        autoLabelError: labelOutcome.error,
    };
}

// ────────────────────────────────────────────────────────────────────────
// Label-purchase helpers — extracted so both the create and the
// already-finalized branches go through identical logic. Idempotent on
// the presence of `label_url`.
// ────────────────────────────────────────────────────────────────────────

async function maybePurchaseSingleLabel(orderInput: any): Promise<{ order: any; error: string | null }> {
    let order = orderInput;
    let autoLabelError: string | null = null;
    // Kill switch for staging / temporary debugging when Shippo is failing
    // (e.g., recipient-address validation errors, customs/tax data missing for
    // international shipments). Set AUTO_LABEL_PURCHASE_ENABLED=false in the
    // environment to skip the auto-purchase entirely — the order still gets
    // created and the buyer still sees the success page; seller just has to
    // buy the label manually later. Re-enable by removing the env var or
    // setting it to "true".
    if ((process.env.AUTO_LABEL_PURCHASE_ENABLED ?? "true").toLowerCase() === "false") {
        console.warn("[checkout-finalize] AUTO_LABEL_PURCHASE_ENABLED=false — skipping single label purchase", {
            orderId: order?.id,
        });
        return { order, error: null };
    }
    if (
        order &&
        order.shipping_stage === "OPTION_SELECTED" &&
        !order.label_url &&
        order.shipping_option_rate_id
    ) {
        try {
            const labelData = await purchaseLabel(order.shipping_option_rate_id);
            order = await (prisma as any).order.update({
                where: { id: order.id },
                data: {
                    shipping_stage: "LABEL_PURCHASED",
                    shipping_status: "PROCESSING",
                    tracking_number: labelData.tracking_number,
                    carrier: order.shipping_option_carrier || "Carrier",
                    shippo_transaction_id: labelData.shippo_transaction_id,
                    label_url: labelData.label_url,
                },
                include: ORDER_WITH_DETAILS_INCLUDE,
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to generate label.";
            autoLabelError = errorMessage;

            // If Shippo rejected recipient details, roll the order back to the
            // address-collection step so the buyer can fix and retry.
            const normalizedError = errorMessage.toLowerCase();
            if (
                normalizedError.includes("recipient address invalid") ||
                normalizedError.includes("address not found") ||
                normalizedError.includes("address_from.phone") ||
                normalizedError.includes("phone field should contain")
            ) {
                order = await (prisma as any).order.update({
                    where: { id: order.id },
                    data: {
                        shipping_stage: "ADDRESS_SET",
                        shipping_status: "NOT_SHIPPED",
                        shipping_option_rate_id: null,
                        shipping_option_carrier: null,
                        shipping_option_service: null,
                        shipping_option_amount: null,
                        shipping_option_currency: null,
                        shipping_option_selected_at: null,
                    },
                    include: ORDER_WITH_DETAILS_INCLUDE,
                });
            }
        }
    }
    return { order, error: autoLabelError };
}

async function maybePurchaseBundleLabel(
    batchId: string,
    bundleOrdersInput: any[],
): Promise<{ bundleOrders: any[]; error: string | null }> {
    let bundleOrders = bundleOrdersInput;
    let bundleAutoLabelError: string | null = null;

    // Same kill switch as the single-item path — gated on the same env var so
    // a single flip covers both buyer flows.
    if ((process.env.AUTO_LABEL_PURCHASE_ENABLED ?? "true").toLowerCase() === "false") {
        console.warn("[checkout-finalize] AUTO_LABEL_PURCHASE_ENABLED=false — skipping bundle label purchase", {
            batchId,
        });
        return { bundleOrders, error: null };
    }

    const labelCarrier = bundleOrders.find((o: any) => o.shipping_option_rate_id)?.shipping_option_rate_id;
    const labelOwner = bundleOrders.find((o: any) => o.shipping_option_rate_id);

    if (labelCarrier && labelOwner && !bundleOrders.some((o: any) => o.label_url)) {
        try {
            const labelData = await purchaseLabel(labelCarrier);
            await (prisma as any).order.updateMany({
                where: { batch_id: batchId },
                data: {
                    shipping_stage: "LABEL_PURCHASED",
                    shipping_status: "PROCESSING",
                    tracking_number: labelData.tracking_number,
                    carrier: labelOwner.shipping_option_carrier || "Carrier",
                    shippo_transaction_id: labelData.shippo_transaction_id,
                    label_url: labelData.label_url,
                },
            });
            bundleOrders = await (prisma as any).order.findMany({
                where: { batch_id: batchId },
                include: ORDER_WITH_DETAILS_INCLUDE,
            });
        } catch (error: any) {
            bundleAutoLabelError = error?.message || "Failed to generate shipping label.";
        }
    }
    return { bundleOrders, error: bundleAutoLabelError };
}
