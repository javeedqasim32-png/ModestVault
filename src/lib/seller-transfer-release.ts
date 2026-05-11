import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

const REFUND_HOLD_DAYS = 3;
const TRANSFER_STATUS_PENDING = "PENDING_HOLD";
const TRANSFER_STATUS_RELEASED = "RELEASED";
const TRANSFER_STATUS_FAILED = "FAILED";

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

export async function releaseEligibleSellerTransfers(limit = 50) {
    const now = new Date();
    const orderDelegate = (prisma as unknown as {
        order: {
            findMany: (args: unknown) => Promise<CandidateOrder[]>;
            update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
        };
    }).order;

    const candidateOrders = await orderDelegate.findMany({
        where: {
            seller_transfer_status: { in: [TRANSFER_STATUS_PENDING, TRANSFER_STATUS_FAILED] },
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
        skipped: 0,
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
        const amountCents = Number(order.seller_transfer_amount_cents || 0);
        const currency = String(order.seller_transfer_currency || "usd").toLowerCase();

        if (!destination || !Number.isFinite(amountCents) || amountCents <= 0) {
            summary.skipped += 1;
            await orderDelegate.update({
                where: { id: order.id },
                data: { seller_transfer_status: TRANSFER_STATUS_FAILED },
            });
            summary.failures.push({ orderId: order.id, reason: "Missing destination account or invalid transfer amount." });
            continue;
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
            summary.released += 1;
        } catch (error) {
            const reason = error instanceof Error ? error.message : "Unknown transfer error";
            await orderDelegate.update({
                where: { id: order.id },
                data: {
                    seller_transfer_status: TRANSFER_STATUS_FAILED,
                },
            });
            summary.failed += 1;
            summary.failures.push({ orderId: order.id, reason });
        }
    }

    return summary;
}
