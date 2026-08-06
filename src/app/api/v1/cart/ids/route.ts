import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/cart/ids
 *
 * Lightweight "what's in my cart" lookup — IDs only. Lets the Flutter
 * client hydrate a Set<String> on sign-in so every Add to Bag button
 * shows its correct state without per-listing requests.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await prisma.cartItem.findMany({
        where: { user_id: principal.id },
        select: { listing_id: true },
    });

    return NextResponse.json({ ids: rows.map((r) => r.listing_id) });
}
