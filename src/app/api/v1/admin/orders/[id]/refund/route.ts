import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/api/admin-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { refundOrder } from "@/app/actions/admin";
import {
    DEFAULT_MODAIRE_REFUND_REASON,
    isValidModaireRefundReason,
    type ModaireRefundReason,
} from "@/lib/refund-reasons";

export const dynamic = "force-dynamic";

const schema = z.object({
    reason: z.string().optional(),
    note: z.string().max(2000).optional(),
});

/**
 * POST /api/v1/admin/orders/[id]/refund
 *
 * Body: `{ reason?: ModaireRefundReason, note?: string }`. Delegates
 * straight to the existing refundOrder server action so the mobile
 * admin and web admin run the same Stripe-refund / transfer-reversal /
 * Shippo-label-refund / re-listing pipeline.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = await parseJsonBody(req, schema).catch(
        () => ({} as { reason?: string; note?: string }),
    );
    const body = parsed instanceof NextResponse ? {} : parsed;

    const reason: ModaireRefundReason = body.reason && isValidModaireRefundReason(body.reason)
        ? body.reason
        : DEFAULT_MODAIRE_REFUND_REASON;

    const { id } = await params;
    const res = await refundOrder(id, { reason, note: body.note });
    if ("error" in res && res.error) {
        return apiError("INVALID_INPUT", res.error);
    }
    return NextResponse.json(res);
}
