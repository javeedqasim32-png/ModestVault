import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { serializeListingSummaryForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/favorites
 *
 * Returns the signed-in user's favorited listings as full mobile-shape
 * summaries (image, title, price, etc.) so the Favorites tab can render
 * the same tile grid as Browse without a second round-trip per item.
 *
 * Sold listings are kept in the response — the tile renders a SOLD badge
 * and the user can still see what they had wanted.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await prisma.favoriteItem.findMany({
        where: { user_id: principal.id },
        orderBy: { created_at: "desc" },
        include: {
            listing: {
                include: {
                    images: {
                        orderBy: { imageOrder: "asc" },
                        take: 1,
                        select: {
                            imageUrl: true,
                            thumbUrl: true,
                            mediumUrl: true,
                            imageOrder: true,
                        },
                    },
                },
            },
        },
    });

    return NextResponse.json({
        favorites: rows.map((row) =>
            serializeListingSummaryForMobile(row.listing),
        ),
    });
}
