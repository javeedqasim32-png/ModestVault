import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { requireBearer } from "@/lib/api/bearer-auth";
import { finalizeCheckoutByPaymentIntent } from "@/lib/checkout-finalize";

export const dynamic = "force-dynamic";

const Body = z.object({
    paymentIntentId: z.string().min(1),
});

/**
 * POST /api/v1/checkout/finalize
 *
 * Called by the mobile client after PaymentSheet reports success. Our copy
 * of the order may already exist (if the Stripe payment_intent.succeeded
 * webhook fired first), in which case the call is idempotent.
 *
 * Verifies ownership via the PaymentIntent metadata.buyerId — a malicious
 * client can't finalize someone else's payment by guessing the PI id.
 *
 * Response shapes:
 *   200 FINALIZED / ALREADY_FINALIZED — { status, order, autoLabelError }
 *   200 NOT_PAID                       — { status, paymentStatus }
 *   200 ALREADY_SOLD                   — { status }
 *   400 MISSING_LISTING                — listing was deleted between submit and pay
 *   401                                — missing or invalid Bearer
 *   403                                — PaymentIntent doesn't belong to caller
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const result = await finalizeCheckoutByPaymentIntent(parsed.paymentIntentId);

    switch (result.status) {
        case "FINALIZED":
        case "ALREADY_FINALIZED":
            // Cross-check ownership before returning order details.
            if (result.order?.purchase?.buyer_id && result.order.purchase.buyer_id !== principal.id) {
                return apiError("FORBIDDEN", "This payment doesn't belong to you.");
            }
            return NextResponse.json({
                status: result.status,
                order: serializeOrderForMobile(result.order),
                autoLabelError: result.autoLabelError ?? null,
            });
        case "NOT_PAID":
            return NextResponse.json({ status: result.status, paymentStatus: result.paymentStatus });
        case "ALREADY_SOLD":
            return NextResponse.json({ status: result.status });
        case "MISSING_LISTING":
            return apiError("NOT_FOUND", "Listing no longer exists.");
    }
}

/**
 * Strip the kitchen-sink Order shape down to what the mobile order-confirmation
 * screen actually renders. Keeps payloads small on cellular and avoids leaking
 * internal columns (seller_transfer_*, etc.) that the mobile client shouldn't
 * see anyway.
 */
function serializeOrderForMobile(order: any) {
    if (!order) return null;
    return {
        id: order.id,
        orderStatus: order.order_status,
        shippingStatus: order.shipping_status,
        shippingStage: order.shipping_stage,
        carrier: order.carrier,
        trackingNumber: order.tracking_number,
        labelUrl: order.label_url,
        shippedAt: order.shipped_at,
        deliveredAt: order.delivered_at,
        listing: order.purchase?.listing
            ? {
                id: order.purchase.listing.id,
                title: order.purchase.listing.title,
                price: order.purchase.listing.price?.toString?.() ?? order.purchase.listing.price,
                imageUrl: order.purchase.listing.image_url,
            }
            : null,
        seller: order.purchase?.listing?.user
            ? {
                id: order.purchase.listing.user.id,
                firstName: order.purchase.listing.user.first_name,
                lastName: order.purchase.listing.user.last_name,
            }
            : null,
    };
}
