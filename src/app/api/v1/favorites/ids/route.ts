import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/favorites/ids
 *
 * Lightweight "what does the current user favorite" query — returns just
 * the listing IDs. The mobile client loads this once on sign-in into a
 * Set<String> and uses it to render heart-filled state on every tile
 * without an extra request per tile.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await prisma.favoriteItem.findMany({
        where: { user_id: principal.id },
        select: { listing_id: true },
    });

    return NextResponse.json({
        ids: rows.map((r) => r.listing_id),
    });
}
