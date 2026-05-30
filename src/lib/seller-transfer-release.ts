import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendUnclaimedPayoutReminderEmail } from "@/lib/email";

const REFUND_HOLD_DAYS = 3;
const REMINDER_DELAY_DAYS = 3;
export const TRANSFER_STATUS_PENDING = "PENDING_HOLD";
export const TRANSFER_STATUS_RELEASED = "RELEASED";
export const TRANSFER_STATUS_FAILED = "FAILED";
export const TRANSFER_STATUS_AWAITING_SELLER = "AWAITING_SELLER_STRIPE";

function getHoldUntilDate(from: Date) {
    const holdUntil = new Date(from);
    holdUntil.setDate(holdUntil.getDate() + REFUND_HOLD_DAYS);
    return holdUntil;
}

type CandidateOrder = {
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
        listing: {
            user: {
                id: string;
                stripe_account_id: string | null;
            };
        };
    };
};

type OrderDelegate = {
    findMany: (args: unknown) => Promise<CandidateOrder[]>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
};

/**
 * Attempt a Stripe transfer for a single order. Mutates the order row on
 * success (RELEASED) or failure (FAILED). Shared by the cron and the
 * retro-release helper.
 */
export async function attemptTransfer(order: CandidateOrder, destination: string) {
    const orderDelegate = (prisma as unknown as { order: OrderDelegate }).order;
    const amountCents = Number(order.seller_transfer_amount_cents || 0);
    const currency = String(order.seller_transfer_currency || "usd").toLowerCase();

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
        await orderDelegate.update({
            where: { id: order.id },
            data: { seller_transfer_status: TRANSFER_STATUS_FAILED },
        });
        return { ok: false as const, reason: "Invalid transfer amount." };
    }

    try {
        const transfer = await stripe.transfers.create({
            amount: amountCents,
            currency,
            destination,
            transfer_group: `order_${order.id}`,
            metadata: {
                orderId: order.id,
                purchaseId: order.purchase_id,
                listingId: order.purchase?.listing_id || "",
                sellerId: order.purchase?.listing?.user?.id || "",
            },
        });

        await orderDelegate.update({
            where: { id: order.id },
            data: {
                seller_transfer_status: TRANSFER_STATUS_RELEASED,
                seller_transfer_id: transfer.id,
                seller_transfer_released_at: new Date(),
            },
        });
        return { ok: true as const, transferId: transfer.id };
    } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown transfer error";
        await orderDelegate.update({
            where: { id: order.id },
            data: { seller_transfer_status: TRANSFER_STATUS_FAILED },
        });
        return { ok: false as const, reason };
    }
}

export async function releaseEligibleSellerTransfers(limit = 50) {
    const now = new Date();
    const orderDelegate = (prisma as unknown as { order: OrderDelegate }).order;

    const candidateOrders = await orderDelegate.findMany({
        where: {
            seller_transfer_status: { in: [TRANSFER_STATUS_PENDING, TRANSFER_STATUS_FAILED, TRANSFER_STATUS_AWAITING_SELLER] },
            seller_transfer_id: null,
            order_status: { notIn: ["REFUNDED", "CANCELLED"] },
            OR: [
                { hold_until: { lte: now } },
                { hold_until: null, delivered_at: { not: null } },
            ],
        },
        include: {
            purchase: {
                include: {
                    listing: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    stripe_account_id: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        take: limit,
        orderBy: [{ hold_until: "asc" }, { delivered_at: "asc" }, { created_at: "asc" }],
    });

    const summary = {
        processed: 0,
        released: 0,
        failed: 0,
        awaitingSeller: 0,
        skipped: 0,
        remindersSent: 0,
        failures: [] as Array<{ orderId: string; reason: string }>,
    };

    for (const order of candidateOrders) {
        summary.processed += 1;

        const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : null;
        if (!deliveredAt) {
            summary.skipped += 1;
            continue;
        }

        const holdUntil = order.hold_until ? new Date(order.hold_until) : getHoldUntilDate(deliveredAt);
        if (!order.hold_until) {
            await orderDelegate.update({
                where: { id: order.id },
                data: { hold_until: holdUntil },
            });
        }
        if (holdUntil > now) {
            summary.skipped += 1;
            continue;
        }

        const destination = order.purchase?.listing?.user?.stripe_account_id;

        // Seller hasn't connected Stripe yet — mark as awaiting and retry on
        // the next cron tick (or sooner if the seller connects via
        // /sell/onboarding-complete which triggers a retro-release).
        if (!destination) {
            if (order.seller_transfer_status !== TRANSFER_STATUS_AWAITING_SELLER) {
                await orderDelegate.update({
                    where: { id: order.id },
                    data: { seller_transfer_status: TRANSFER_STATUS_AWAITING_SELLER },
                });
            }
            summary.awaitingSeller += 1;
            continue;
        }

        const result = await attemptTransfer(order, destination);
        if (result.ok) {
            summary.released += 1;
        } else {
            summary.failed += 1;
            summary.failures.push({ orderId: order.id, reason: result.reason });
        }
    }

    // Second pass: 3-day reminder for sellers with payouts waiting and no
    // reminder yet. Idempotent because of unclaimed_reminder_sent_at.
    summary.remindersSent = await sendPendingPayoutReminders();

    return summary;
}

type ReminderOrder = {
    id: string;
    seller_transfer_amount_cents: number | null;
    purchase: {
        listing: {
            user: {
                id: string;
                email: string | null;
                stripe_account_id: string | null;
            };
        };
    };
};

async function sendPendingPayoutReminders(): Promise<number> {
    type ReminderDelegate = {
        findMany: (args: unknown) => Promise<ReminderOrder[]>;
        updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const orderDelegate = (prisma as unknown as { order: ReminderDelegate }).order;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - REMINDER_DELAY_DAYS);

    const reminderCandidates = await orderDelegate.findMany({
        where: {
            seller_transfer_status: TRANSFER_STATUS_AWAITING_SELLER,
            unclaimed_reminder_sent_at: null,
            created_at: { lte: cutoff },
        },
        include: {
            purchase: {
                include: {
                    listing: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    email: true,
                                    stripe_account_id: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        take: 500,
    });

    if (reminderCandidates.length === 0) return 0;

    // Group by seller. Skip any orders where the seller has somehow connected
    // Stripe since the cron picked these up — the next tick will release them.
    const bySeller = new Map<string, { email: string; totalCents: number; orderIds: string[] }>();
    for (const order of reminderCandidates) {
        const user = order.purchase?.listing?.user;
        if (!user?.email || user.stripe_account_id) continue;
        const existing = bySeller.get(user.id) || { email: user.email, totalCents: 0, orderIds: [] };
        existing.totalCents += Number(order.seller_transfer_amount_cents || 0);
        existing.orderIds.push(order.id);
        bySeller.set(user.id, existing);
    }

    let remindersSent = 0;
    for (const { email, totalCents, orderIds } of bySeller.values()) {
        const totalDollars = totalCents / 100;
        await sendUnclaimedPayoutReminderEmail(email, totalDollars, orderIds.length);
        await orderDelegate.updateMany({
            where: { id: { in: orderIds } },
            data: { unclaimed_reminder_sent_at: new Date() },
        });
        remindersSent += 1;
    }

    return remindersSent;
}
