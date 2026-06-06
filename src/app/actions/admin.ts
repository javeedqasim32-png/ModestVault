"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendListingApprovedEmail, sendListingRejectedEmail, sendRefundIssuedBuyerEmail, sendRefundIssuedSellerEmail } from "@/lib/email";
import { createNotification } from "@/app/actions/notifications";
import { refundPayment, reverseTransfer, stripe } from "@/lib/stripe";
import {
    DEFAULT_MODAIRE_REFUND_REASON,
    getModaireRefundReasonLabel,
    isValidModaireRefundReason,
    refundReasonRequiresNote,
    toStripeRefundReason,
    type ModaireRefundReason,
} from "@/lib/refund-reasons";

/**
 * Verifies the current user is an admin. Throws if not.
 */
async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Authentication required.");
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, is_admin: true },
    });

    if (!user?.is_admin) {
        throw new Error("Admin access required.");
    }

    return user;
}

const REFUND_HOLD_DAYS = 3;

function getHoldUntilDate(from: Date) {
    const holdUntil = new Date(from);
    holdUntil.setDate(holdUntil.getDate() + REFUND_HOLD_DAYS);
    return holdUntil;
}

export async function approveListing(listingId: string) {
    const admin = await requireAdmin();

    const updated = await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "APPROVED",
            status: "AVAILABLE",
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: null,
        },
        select: {
            id: true,
            title: true,
            user: {
                select: { id: true, email: true }
            }
        }
    });

    if (updated.user?.email) {
        void sendListingApprovedEmail(updated.user.email, updated.title);
    }

    await createNotification({
        userId: updated.user.id,
        type: "LISTING_APPROVED",
        title: `Listing approved: ${updated.title}`,
        body: "Your listing is now live on the marketplace.",
        linkUrl: `/listings/${updated.id}`,
    });

    revalidatePath("/admin/listings");
    revalidatePath("/browse");
    revalidatePath("/");
    return { success: true };
}

/**
 * Approve + curate onto the Home "New In" rail in one click. Same email and
 * same LISTING_APPROVED notification as plain approveListing — "featured" is
 * admin-side curation metadata, not customer-facing.
 */
export async function approveAndFeatureListing(listingId: string) {
    const admin = await requireAdmin();

    const updated = await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "APPROVED",
            status: "AVAILABLE",
            is_featured: true,
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: null,
        },
        select: {
            id: true,
            title: true,
            user: {
                select: { id: true, email: true }
            }
        }
    });

    if (updated.user?.email) {
        void sendListingApprovedEmail(updated.user.email, updated.title);
    }

    await createNotification({
        userId: updated.user.id,
        type: "LISTING_APPROVED",
        title: `Listing approved: ${updated.title}`,
        body: "Your listing is now live on the marketplace.",
        linkUrl: `/listings/${updated.id}`,
    });

    revalidatePath("/admin/listings");
    revalidatePath("/browse");
    revalidatePath("/");
    return { success: true };
}

/**
 * Admin-only curation toggle: promote/demote a listing from the Home "New In"
 * rail without touching moderation_status. No email, no notification — this
 * is a purely admin-facing curation flip.
 */
export async function setListingFeatured(listingId: string, featured: boolean) {
    await requireAdmin();

    await prisma.listing.update({
        where: { id: listingId },
        data: { is_featured: featured },
    });

    revalidatePath("/admin/listings");
    revalidatePath("/");
    return { success: true };
}

/**
 * Persists the admin-chosen ordering of the Home "Featured" rail. `orderedIds`
 * is the full ordered list the admin wants — index 0 is shown first on Home.
 * Each listing's `featured_order` is set to its array index; rows not in the
 * list are reset to NULL so they fall to the end of the rail (or off it once
 * more than 8 listings are featured). Runs in a transaction so the rail never
 * lands in a half-reordered state.
 */
export async function setFeaturedListingsOrder(orderedIds: string[]) {
    await requireAdmin();

    if (!Array.isArray(orderedIds)) {
        throw new Error("orderedIds must be an array.");
    }
    const cleanIds = Array.from(new Set(orderedIds.filter((id) => typeof id === "string" && id.length > 0)));

    await prisma.$transaction([
        // Reset every currently-ordered featured row first so any listing the
        // admin dropped from the rail loses its old slot.
        prisma.listing.updateMany({
            where: { is_featured: true },
            data: { featured_order: null },
        }),
        ...cleanIds.map((id, index) =>
            prisma.listing.update({
                where: { id },
                data: { featured_order: index, is_featured: true },
            })
        ),
    ]);

    revalidatePath("/admin/featured");
    revalidatePath("/");
    return { success: true };
}

/**
 * Partial-accept: listing becomes visible on Explore (pushed to the end) but
 * is excluded from the Home page feeds. No email is sent and the seller sees
 * the listing as "Active" in their dashboard — same surface area as a fully
 * approved listing, with only ranking differences.
 */
export async function partiallyApproveListing(listingId: string) {
    const admin = await requireAdmin();

    await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "PARTIAL_APPROVED",
            status: "AVAILABLE",
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: null,
        },
    });

    revalidatePath("/admin/listings");
    revalidatePath("/browse");
    revalidatePath("/");
    return { success: true };
}

/**
 * Rejects a listing with an optional reason.
 */
export async function rejectListing(listingId: string, reason?: string) {
    const admin = await requireAdmin();

    const updated = await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "REJECTED",
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: reason || null,
        },
        select: {
            id: true,
            title: true,
            user: {
                select: { id: true, email: true }
            }
        }
    });

    if (updated.user?.email && reason) {
        void sendListingRejectedEmail(updated.user.email, updated.title, reason);
    }

    await createNotification({
        userId: updated.user.id,
        type: "LISTING_REJECTED",
        title: `Listing rejected: ${updated.title}`,
        body: reason ? `Reason: ${reason}` : "Edit the listing and resubmit for review.",
        linkUrl: "/sell",
    });

    revalidatePath("/admin/listings");
    revalidatePath("/browse");
    return { success: true };
}

/**
 * Updates shipping status for an order.
 */
export async function updateOrderShipping(
    orderId: string,
    data: {
        shippingStatus?: string;
        carrier?: string;
        trackingNumber?: string;
    }
) {
    await requireAdmin();

    const updateData: Record<string, unknown> = {};

    if (data.shippingStatus) {
        updateData.shipping_status = data.shippingStatus;

        if (data.shippingStatus === "SHIPPED") {
            updateData.shipped_at = new Date();
        }
        if (data.shippingStatus === "DELIVERED") {
            const deliveredAt = new Date();
            updateData.delivered_at = deliveredAt;
            updateData.hold_until = getHoldUntilDate(deliveredAt);
            updateData.order_status = "FULFILLED";
            updateData.seller_transfer_status = "PENDING_HOLD";
        }
    }

    if (data.carrier !== undefined) updateData.carrier = data.carrier;
    if (data.trackingNumber !== undefined) updateData.tracking_number = data.trackingNumber;

    await prisma.order.update({
        where: { id: orderId },
        data: updateData,
    });

    revalidatePath("/admin/orders");
    revalidatePath("/dashboard/purchases");
    return { success: true };
}

/**
 * Updates the imageOrder field for multiple listing images in a safe transaction.
 */
export async function updateListingImagesOrder(
    listingId: string,
    imageIdsInNewOrder: string[]
) {
    await requireAdmin();

    // Perform database updates inside a safe transaction to avoid unique constraint violations
    await prisma.$transaction(async (tx) => {
        // 1. Temporarily move all of this listing's images to negative orders (no unique conflict)
        const images = await tx.listingImage.findMany({
            where: { listingId },
            select: { id: true },
        });

        for (let i = 0; i < images.length; i++) {
            await tx.listingImage.update({
                where: { id: images[i].id },
                data: { imageOrder: -(i + 1) },
            });
        }

        // 2. Set the new positive orders based on the ordered array
        for (let idx = 0; idx < imageIdsInNewOrder.length; idx++) {
            await tx.listingImage.update({
                where: { id: imageIdsInNewOrder[idx] },
                data: { imageOrder: idx },
            });
        }
    });

    revalidatePath("/admin/listings");
    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/");
    revalidatePath("/browse");

    return { success: true };
}

type OrderRefundLoad = {
    id: string;
    order_status: string;
    shipping_status: string;
    seller_transfer_status: string;
    seller_transfer_id: string | null;
    refund_id: string | null;
    purchase: {
        id: string;
        amount: number | string | { toString(): string };
        payment_intent_id: string | null;
        // Fallback recovery: if payment_intent_id is missing (legacy / bundled
        // checkout / pre-success-page failure) we can fetch the session from
        // Stripe and pull the PI off it, then backfill the column.
        stripe_session_id: string | null;
        listing_id: string;
        buyer: { id: string; email: string | null } | null;
        listing: {
            title: string;
            user: { id: string; email: string | null } | null;
        };
    };
};

/**
 * Pull the order with everything the refund/cancel flow needs in one query.
 * Throws if the order doesn't exist so callers can surface a 404 cleanly.
 */
async function loadOrderForRefund(orderId: string): Promise<OrderRefundLoad> {
    const order = await (prisma as any).order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            order_status: true,
            shipping_status: true,
            seller_transfer_status: true,
            seller_transfer_id: true,
            refund_id: true,
            purchase: {
                select: {
                    id: true,
                    amount: true,
                    payment_intent_id: true,
                    stripe_session_id: true,
                    listing_id: true,
                    buyer: { select: { id: true, email: true } },
                    listing: {
                        select: {
                            title: true,
                            user: { select: { id: true, email: true } },
                        },
                    },
                },
            },
        },
    });
    if (!order) {
        throw new Error("Order not found.");
    }
    return order as OrderRefundLoad;
}

/**
 * Resolve the PaymentIntent for a Purchase, with a Stripe-session fallback for
 * legacy / bundled-checkout orders that never had `payment_intent_id` written.
 * On a successful fallback we backfill the column so future refund attempts
 * (and any analytics queries) work without another Stripe round-trip.
 */
async function resolvePaymentIntentId(purchase: OrderRefundLoad["purchase"]): Promise<
    | { ok: true; paymentIntentId: string }
    | { ok: false; error: string }
> {
    if (purchase.payment_intent_id) {
        return { ok: true, paymentIntentId: purchase.payment_intent_id };
    }
    if (!purchase.stripe_session_id) {
        return {
            ok: false,
            error: "Missing payment_intent_id and stripe_session_id — cannot recover Stripe payment for this order.",
        };
    }
    try {
        const session = await stripe.checkout.sessions.retrieve(purchase.stripe_session_id);
        const paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        if (!paymentIntentId) {
            return {
                ok: false,
                error: "Stripe session has no PaymentIntent — order may have been free or test-mode.",
            };
        }
        // Backfill so we don't hit the slow path again. If the write itself
        // fails (e.g., the unique constraint somehow conflicts), we still
        // proceed with the refund — the recovery succeeded.
        try {
            await (prisma as any).purchase.update({
                where: { id: purchase.id },
                data: { payment_intent_id: paymentIntentId },
            });
        } catch (err) {
            console.warn("resolvePaymentIntentId: backfill of Purchase.payment_intent_id failed", err);
        }
        return { ok: true, paymentIntentId };
    } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown Stripe error";
        return { ok: false, error: `Could not fetch Stripe session: ${detail}` };
    }
}

/**
 * Internal: runs the actual refund pipeline shared by refundOrder + cancelOrder.
 * 1. Creates Stripe refund on the buyer's payment_intent.
 * 2. If seller transfer was already RELEASED, reverses it.
 * 3. Updates the order row with audit fields + final order_status.
 * 4. Fires buyer + seller emails (fire-and-forget so they don't block the response).
 */
// Shipping statuses that mean "seller still has the item" — admin-cancellations
// at this stage flip the listing back to AVAILABLE so the seller can re-list.
const PRE_SHIPMENT_STATUSES = new Set(["NOT_SHIPPED", "PROCESSING"]);

async function processRefund(
    orderId: string,
    opts: { reason: ModaireRefundReason; note?: string; initiatorId: string }
) {
    // Defense-in-depth: validate reason here too (the UI already gates this,
    // but the action could be called directly).
    if (!isValidModaireRefundReason(opts.reason)) {
        return { error: "Invalid refund reason." } as const;
    }
    const trimmedNote = opts.note?.trim() ?? "";
    if (refundReasonRequiresNote(opts.reason) && trimmedNote.length === 0) {
        return { error: "A note is required when the reason is 'Other'." } as const;
    }

    const order = await loadOrderForRefund(orderId);

    if (order.refund_id) {
        return { error: "This order has already been refunded." } as const;
    }
    if (order.order_status === "REFUNDED" || order.order_status === "CANCELLED") {
        return { error: `Order is already ${order.order_status.toLowerCase()}.` } as const;
    }

    // Resolve the PaymentIntent — uses the stripe_session_id fallback if the
    // Purchase row doesn't have payment_intent_id stored.
    const piResolution = await resolvePaymentIntentId(order.purchase);
    if (!piResolution.ok) {
        return { error: piResolution.error } as const;
    }
    const paymentIntentId = piResolution.paymentIntentId;

    // 1. Stripe refund. We always map to `requested_by_customer` because none
    // of the Modaire taxonomy maps to `fraudulent` / `duplicate`. The richer
    // reason lives in our DB for analytics.
    let refund;
    try {
        refund = await refundPayment(paymentIntentId, {
            reason: toStripeRefundReason(opts.reason),
            metadata: {
                orderId: order.id,
                initiatorId: opts.initiatorId,
                modaireReason: opts.reason,
                note: trimmedNote,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown Stripe error.";
        return { error: `Stripe refund failed: ${message}` } as const;
    }

    // 2. If the seller was already paid, pull the funds back from their connected account.
    let transferReversalId: string | null = null;
    let transferReversedAt: Date | null = null;
    let reversalError: string | null = null;
    if (order.seller_transfer_status === "RELEASED" && order.seller_transfer_id) {
        try {
            const reversal = await reverseTransfer(order.seller_transfer_id, {
                metadata: {
                    orderId: order.id,
                    refundId: refund.id,
                },
            });
            transferReversalId = reversal.id;
            transferReversedAt = new Date();
        } catch (err) {
            // Surface to admin but don't roll back the refund — the buyer's money
            // is already on its way back. The seller's debt becomes a manual issue
            // that admin should reconcile (e.g., hold against future payouts).
            reversalError = err instanceof Error ? err.message : "Unknown reversal error.";
        }
    }

    // Pre-shipment vs post-shipment classification drives:
    //   - order_status: "CANCELLED" if the seller never shipped, "REFUNDED" if
    //     the item already left their hands. Analytics queries can still
    //     distinguish "cheap unwinds" from "expensive ones" via this field.
    //   - Listing.status: re-listed (AVAILABLE) only when the seller still has
    //     the physical item. Post-shipment items stay SOLD because return
    //     logistics are handled out-of-band.
    const isPreShipment = PRE_SHIPMENT_STATUSES.has(order.shipping_status);
    const finalOrderStatus: "CANCELLED" | "REFUNDED" = isPreShipment ? "CANCELLED" : "REFUNDED";

    // 3. Persist the new state. Store the Modaire reason (the raw enum value)
    // so future analytics queries can GROUP BY it without label drift.
    await (prisma as any).order.update({
        where: { id: order.id },
        data: {
            order_status: finalOrderStatus,
            refund_id: refund.id,
            refunded_at: new Date(),
            refund_reason: opts.reason,
            refund_note: trimmedNote || null,
            refund_initiator_id: opts.initiatorId,
            seller_transfer_reversal_id: transferReversalId,
            seller_transfer_reversed_at: transferReversedAt,
            // If the cron hasn't run yet, mark FAILED so it never tries.
            ...(order.seller_transfer_status === "PENDING_HOLD" ||
                order.seller_transfer_status === "AWAITING_SELLER_STRIPE"
                ? { seller_transfer_status: "FAILED" }
                : {}),
        },
    });

    // 3b. Re-list the listing if the seller still has the item. updateMany is
    // a defensive no-op if the listing was deleted between the sale and the
    // refund.
    let relisted = false;
    if (isPreShipment) {
        try {
            const result = await prisma.listing.updateMany({
                where: { id: order.purchase.listing_id, status: "SOLD" },
                data: { status: "AVAILABLE" },
            });
            relisted = result.count > 0;
        } catch (err) {
            console.warn("processRefund: failed to re-list listing after cancel", err);
        }
    }

    // 4. Notify buyer + seller. Fire-and-forget so a failed email doesn't tank
    // the response. Email copy combines the category label + admin note so
    // both sides see "what happened" AND "any specifics admin added".
    const amount = Number(order.purchase.amount ?? 0);
    const reasonLabel = getModaireRefundReasonLabel(opts.reason);
    const reasonCopy = trimmedNote
        ? `${reasonLabel} — ${trimmedNote}`
        : reasonLabel;
    const buyerEmail = order.purchase.buyer?.email;
    const sellerEmail = order.purchase.listing.user?.email;
    if (buyerEmail) {
        void sendRefundIssuedBuyerEmail(buyerEmail, order.purchase.listing.title, amount, reasonCopy);
    }
    if (sellerEmail) {
        void sendRefundIssuedSellerEmail(
            sellerEmail,
            order.purchase.listing.title,
            amount,
            reasonCopy,
            transferReversedAt !== null
        );
    }

    revalidatePath("/admin/orders");
    revalidatePath("/dashboard/purchases");
    revalidatePath("/dashboard/sales");
    revalidatePath("/sell");
    if (relisted) {
        revalidatePath("/browse");
        revalidatePath("/");
        revalidatePath(`/listings/${order.purchase.listing_id}`);
    }

    return {
        success: true as const,
        refundId: refund.id,
        transferReversalId,
        reversalError,
        orderStatus: finalOrderStatus,
        relisted,
    };
}

/**
 * Admin-only: issue a full refund for an order at any stage and mark it REFUNDED.
 * Reverses the seller transfer if it was already released. Sends emails to both
 * parties. Idempotent on `refund_id`.
 */
/**
 * Admin-only: unwind an order at any stage of its lifecycle. The function
 * auto-detects whether this is a pre- or post-shipment unwind based on the
 * Order's shipping_status, then:
 *   - Refunds the buyer via Stripe (full refund)
 *   - Reverses the seller transfer if it was already released
 *   - Sets order_status to "CANCELLED" (pre-shipment) or "REFUNDED" (post)
 *   - Re-lists the underlying Listing (status → AVAILABLE) only when pre-
 *     shipment, since the seller still has the item to sell
 *   - Sends buyer + seller emails
 */
export async function refundOrder(
    orderId: string,
    opts: { reason?: ModaireRefundReason; note?: string } = {}
) {
    const admin = await requireAdmin();
    return processRefund(orderId, {
        reason: opts.reason ?? DEFAULT_MODAIRE_REFUND_REASON,
        note: opts.note,
        initiatorId: admin.id,
    });
}
