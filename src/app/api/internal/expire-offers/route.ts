import { NextResponse } from "next/server";
import { expireOffers } from "@/lib/offers";
import { isCronAuthorized } from "@/lib/api/cron-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/expire-offers
 *
 * Cron sweep (every ~5 min). Expires offers whose response deadline passed
 * (PENDING/COUNTERED past expires_at) and releases reservations whose pay-window
 * lapsed (AWAITING_PAYMENT past pay_window_expires_at), notifying buyers/sellers.
 *
 * Auth: x-cron-secret header against INTERNAL_CRON_SECRET — same pattern as
 * /api/internal/release-seller-transfers.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await expireOffers();
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to expire offers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
