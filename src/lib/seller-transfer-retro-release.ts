import { prisma } from "@/lib/prisma";
import {
    attemptTransfer,
    TRANSFER_STATUS_AWAITING_SELLER,
    TRANSFER_STATUS_FAILED,
} from "@/lib/seller-transfer-release";

type RetroOrder = {
    id: string;
    created_at: Date;
    delivered_at: Date | null;
    hold_until: Date | null;
    order_status: string;
    purchase_id: string;
    seller_transfer_status: string;
    seller_transfer_id: string | null;
    seller_transfer_amount_cents: number | null;
    seller_transfer_currency: string | null;
    purchase: {
        listing_id: string;
        // Needed so attemptTransfer() can verify the buyer's Stripe payment
        // cleared before pushing seller funds out.
        payment_intent_id: string | null;
        listing: {
            user: {
                id: string;
                stripe_account_id: string | null;
            };
        };
    };
};

/**
 * Release all pending transfers for a seller who has just completed Stripe
 * onboarding. Called from /sell/onboarding-complete after seller_enabled flips
 * to true. Safe to call even when the user has no AWAITING orders — it's a no-op.
 *
 * Looks up the user fresh from the DB so the Stripe account id is current; if
 * for any reason the user STILL doesn't have stripe_account_id (e.g., we were
 * called speculatively), the function returns an empty summary without
 * attempting transfers.
 */
export async function releaseSellerPendingTransfers(userId: string) {
    const summary = {
        released: 0,
        failed: 0,
        totalCentsReleased: 0,
        failures: [] as Array<{ orderId: string; reason: string }>,
    };

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { stripe_account_id: true },
    });
    const destination = user?.stripe_account_id;
    if (!destination) return summary;

    const orderDelegate = (prisma as unknown as {
        order: { findMany: (args: unknown) => Promise<RetroOrder[]> };
    }).order;

    const orders = await orderDelegate.findMany({
        where: {
            seller_transfer_status: { in: [TRANSFER_STATUS_AWAITING_SELLER, TRANSFER_STATUS_FAILED] },
            seller_transfer_id: null,
            order_status: { notIn: ["REFUNDED", "CANCELLED"] },
            purchase: {
                listing: { user_id: userId },
            },
        },
        include: {
            purchase: {
                include: {
                    listing: {
                        include: {
                            user: { select: { id: true, stripe_account_id: true } },
                        },
                    },
                },
            },
        },
    });

    for (const order of orders) {
        const result = await attemptTransfer(order, destination);
        if (result.ok) {
            summary.released += 1;
            summary.totalCentsReleased += Number(order.seller_transfer_amount_cents || 0);
        } else {
            summary.failed += 1;
            summary.failures.push({ orderId: order.id, reason: result.reason });
        }
    }

    return summary;
}
