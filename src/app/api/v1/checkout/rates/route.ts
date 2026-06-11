import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { requireBearer } from "@/lib/api/bearer-auth";
import {
    getShippingRatesForListingByUserId,
    getShippingRatesForBundleByUserId,
} from "@/app/actions/checkout";

export const dynamic = "force-dynamic";

const AddressSchema = z.object({
    name: z.string().min(1, "Name is required."),
    line1: z.string().min(1, "Street address is required."),
    line2: z.string().optional().default(""),
    city: z.string().min(1, "City is required."),
    state: z.string().min(1, "State is required."),
    postal_code: z.string().min(1, "ZIP code is required."),
    country: z.string().default("US"),
    phone: z.string().min(1, "Phone is required."),
});

const Body = z.union([
    z.object({ listingId: z.string().min(1), address: AddressSchema }),
    z.object({ listingIds: z.array(z.string().min(1)).min(2).max(20), address: AddressSchema }),
]);

/**
 * POST /api/v1/checkout/rates
 *
 * Returns Shippo shipping rates for either a single listing or a bundle of
 * listings from the same seller. Delegates to the auth-free *ByUserId
 * functions in src/app/actions/checkout.ts so the same validation, address
 * normalization, and Shippo logic runs for web (cookie session) and mobile
 * (Bearer JWT).
 *
 * Body (single):   { listingId, address }
 * Body (bundle):   { listingIds: [...], address }
 *
 * Response 200:    { shipmentId, rates: [{rateId, carrier, serviceLevel, amount, currency, estimatedDays}] }
 * Errors:          400 on validation, 401 on missing Bearer, the wrapped
 *                  function's friendly error text on Shippo / listing issues.
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const address = { ...parsed.address, line2: parsed.address.line2 ?? "" };
    const result =
        "listingId" in parsed
            ? await getShippingRatesForListingByUserId(principal.id, parsed.listingId, address)
            : await getShippingRatesForBundleByUserId(principal.id, parsed.listingIds, address);

    if ("error" in result && result.error) {
        return apiError("INVALID_INPUT", result.error);
    }
    if (!("rates" in result)) {
        return apiError("UNAVAILABLE", "No rates returned.");
    }

    return NextResponse.json({
        shipmentId: result.shipmentId,
        rates: result.rates,
    });
}
