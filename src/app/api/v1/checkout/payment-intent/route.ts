import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { requireBearer } from "@/lib/api/bearer-auth";
import {
    createPaymentIntentForListingByUserId,
    createPaymentIntentForBundleByUserId,
} from "@/app/actions/checkout";

export const dynamic = "force-dynamic";

const AddressSchema = z.object({
    name: z.string().min(1),
    line1: z.string().min(1),
    line2: z.string().optional().default(""),
    city: z.string().min(1),
    state: z.string().min(1),
    postal_code: z.string().min(1),
    country: z.string().default("US"),
    phone: z.string().min(1),
});

const SelectedRateSchema = z.object({
    rateId: z.string().min(1),
    carrier: z.string().min(1),
    serviceLevel: z.string().min(1),
    amount: z.string().min(1),
    currency: z.string().min(1),
    estimatedDays: z.number().int().optional(),
    shipmentId: z.string().optional(),
});

const Body = z.union([
    z.object({
        listingId: z.string().min(1),
        address: AddressSchema,
        selectedRate: SelectedRateSchema,
    }),
    z.object({
        listingIds: z.array(z.string().min(1)).min(2).max(20),
        address: AddressSchema,
        selectedRate: SelectedRateSchema,
    }),
]);

/**
 * POST /api/v1/checkout/payment-intent
 *
 * Creates a Stripe PaymentIntent + EphemeralKey for the mobile PaymentSheet
 * flow. Accepts either a single listing or a same-seller bundle:
 *
 *   Single:  { listingId, address, selectedRate }
 *   Bundle:  { listingIds: [...], address, selectedRate }
 *
 * Bundle response also includes `batchId` so the client can correlate the
 * payment with the N Orders created at finalize-time. Both shapes return
 * the same PaymentSheet-ready envelope so the Flutter client picks one
 * code path.
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const address = { ...parsed.address, line2: parsed.address.line2 ?? "" };

    const result = "listingIds" in parsed
        ? await createPaymentIntentForBundleByUserId(
              principal.id,
              parsed.listingIds,
              address,
              parsed.selectedRate,
          )
        : await createPaymentIntentForListingByUserId(
              principal.id,
              parsed.listingId,
              address,
              parsed.selectedRate,
          );

    if ("error" in result && result.error) {
        return apiError("INVALID_INPUT", result.error);
    }

    return NextResponse.json({
        paymentIntentId: result.paymentIntentId,
        clientSecret: result.clientSecret,
        ephemeralKey: result.ephemeralKey,
        customerId: result.customerId,
        breakdown: result.breakdown,
        batchId: "batchId" in result ? result.batchId : null,
    });
}
