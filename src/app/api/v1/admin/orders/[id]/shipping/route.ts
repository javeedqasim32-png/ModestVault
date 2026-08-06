import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/api/admin-auth";
import { parseJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set([
    "NOT_SHIPPED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "RETURNED",
]);

const REFUND_HOLD_DAYS = 3;
function holdUntil(from: Date) {
    const d = new Date(from);
    d.setDate(d.getDate() + REFUND_HOLD_DAYS);
    return d;
}

const schema = z.object({
    shippingStatus: z.string().optional(),
    carrier: z.string().optional(),
    trackingNumber: z.string().optional(),
});

/**
 * PUT /api/v1/admin/orders/[id]/shipping
 *
 * Body: `{ shippingStatus?, carrier?, trackingNumber? }`. Mirrors
 * updateOrderShipping in src/app/actions/admin.ts:
 *   - SHIPPED also stamps shipped_at
 *   - DELIVERED stamps delivered_at, sets hold_until = +3 days,
 *     flips order_status → FULFILLED and seller_transfer_status →
 *     PENDING_HOLD so the payout cron will pick it up.
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = await parseJsonBody(req, schema);
    if (parsed instanceof NextResponse) return parsed;
    const body = parsed;

    const { id } = await params;
    const exists = await prisma.order.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!exists) return apiError("NOT_FOUND", "Order not found.");

    const data: Record<string, unknown> = {};
    if (body.shippingStatus) {
        if (!VALID_STATUSES.has(body.shippingStatus)) {
            return apiError("INVALID_INPUT", "Unknown shipping status.");
        }
        data.shipping_status = body.shippingStatus;
        if (body.shippingStatus === "SHIPPED") {
            data.shipped_at = new Date();
        }
        if (body.shippingStatus === "DELIVERED") {
            const deliveredAt = new Date();
            data.delivered_at = deliveredAt;
            data.hold_until = holdUntil(deliveredAt);
            data.order_status = "FULFILLED";
            data.seller_transfer_status = "PENDING_HOLD";
        }
    }
    if (body.carrier !== undefined) data.carrier = body.carrier;
    if (body.trackingNumber !== undefined) {
        data.tracking_number = body.trackingNumber;
    }

    if (Object.keys(data).length === 0) {
        return apiError("INVALID_INPUT", "Nothing to update.");
    }

    await prisma.order.update({ where: { id }, data });
    return NextResponse.json({ success: true });
}
