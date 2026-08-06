import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { purchaseLabel } from "@/lib/shippo";
import { createNotification } from "@/app/actions/notifications";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/seller/sales/[orderId]/label
 *
 * Returns the state needed for the mobile "Generate label" sheet:
 *   - hasLabel: label already bought
 *   - hasBuyerAddress: buyer has finalized shipping address
 *   - hasBuyerSelection: buyer picked a carrier/service rate
 *   - selection: the chosen rate (carrier/service/amount)
 *   - labelUrl/trackingNumber/carrier: present once hasLabel is true
 *
 * Mirrors getSellerLabelSelection in src/app/actions/orders.ts so the
 * web and mobile UIs converge on the same state machine.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ orderId: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { orderId } = await params;
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { purchase: { include: { listing: true } } },
    });
    if (!order) return apiError("NOT_FOUND", "Order not found.");
    if (order.purchase.listing.user_id !== principal.id) {
        return apiError("FORBIDDEN", "Not your order.");
    }

    const addr = (order.shipping_address || {}) as Record<string, unknown>;
    const hasBuyerAddress =
        order.shipping_stage !== "ADDRESS_MISSING" &&
        !!addr.line1 &&
        !!addr.city &&
        !!addr.state &&
        !!addr.postal_code;
    const hasBuyerSelection =
        order.shipping_stage === "OPTION_SELECTED" &&
        !!order.shipping_option_rate_id;

    return NextResponse.json({
        hasLabel: !!order.label_url,
        shippingStage: order.shipping_stage,
        hasBuyerAddress,
        hasBuyerSelection,
        labelUrl: order.label_url ?? null,
        trackingNumber: order.tracking_number ?? null,
        carrier: order.carrier ?? null,
        selection: hasBuyerSelection
            ? {
                  rateId: order.shipping_option_rate_id,
                  carrier: order.shipping_option_carrier,
                  serviceLevel: order.shipping_option_service,
                  amount:
                      order.shipping_option_amount != null
                          ? Number(order.shipping_option_amount)
                          : null,
                  currency: order.shipping_option_currency,
              }
            : null,
    });
}

/**
 * POST /api/v1/seller/sales/[orderId]/label
 *
 * Buys the Shippo label using the buyer's already-selected rate, stamps
 * label/tracking/carrier onto the order (and every sibling order in the
 * same batch), and notifies the buyer. Idempotent — if a label already
 * exists, returns it. Mirrors purchaseSelectedShippingLabel.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ orderId: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { orderId } = await params;
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { purchase: { include: { listing: true, buyer: true } } },
    });
    if (!order) return apiError("NOT_FOUND", "Order not found.");
    if (order.purchase.listing.user_id !== principal.id) {
        return apiError("FORBIDDEN", "Only the seller can buy this label.");
    }

    if (order.label_url || order.shipping_stage === "LABEL_PURCHASED") {
        return NextResponse.json({
            labelUrl: order.label_url,
            trackingNumber: order.tracking_number,
            carrier: order.carrier,
        });
    }

    const selectedRateId = order.shipping_option_rate_id;
    const selectedCarrier = order.shipping_option_carrier;
    if (!selectedRateId) {
        return apiError(
            "INVALID_INPUT",
            "Buyer has not selected a shipping option yet.",
        );
    }
    if (order.shipping_stage !== "OPTION_SELECTED") {
        return apiError(
            "INVALID_INPUT",
            "Order is not ready for label purchase.",
        );
    }

    let labelData: Awaited<ReturnType<typeof purchaseLabel>>;
    try {
        labelData = await purchaseLabel(selectedRateId);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Shippo error.";
        return apiError("UNAVAILABLE", msg);
    }

    await prisma.$transaction(async (tx) => {
        const latest = await tx.order.findUnique({ where: { id: orderId } });
        if (!latest) throw new Error("Order vanished mid-transaction.");
        if (latest.label_url || latest.shipping_stage === "LABEL_PURCHASED") {
            return;
        }
        const fields = {
            shipping_stage: "LABEL_PURCHASED",
            shipping_status: "PROCESSING",
            tracking_number: labelData.tracking_number,
            carrier: selectedCarrier || "Carrier",
            shippo_transaction_id: labelData.shippo_transaction_id,
            label_url: labelData.label_url,
        };
        if (latest.batch_id) {
            await tx.order.updateMany({
                where: { batch_id: latest.batch_id },
                data: fields,
            });
        } else {
            await tx.order.update({ where: { id: orderId }, data: fields });
        }
    });

    // Notify the buyer (or every buyer in the batch — same buyer in practice).
    const toNotify = order.batch_id
        ? await prisma.order.findMany({
              where: { batch_id: order.batch_id },
              include: { purchase: { include: { listing: true, buyer: true } } },
          })
        : [order];
    for (const o of toNotify) {
        await createNotification({
            userId: o.purchase.buyer.id,
            type: "ORDER_SHIPPED",
            title: `Shipped: ${o.purchase.listing.title}`,
            body: `Tracking ${labelData.tracking_number} (${selectedCarrier || "carrier"}). Updates will appear here.`,
            linkUrl: "/dashboard/purchases",
        });
    }

    return NextResponse.json({
        labelUrl: labelData.label_url,
        trackingNumber: labelData.tracking_number,
        carrier: selectedCarrier || "Carrier",
    });
}
