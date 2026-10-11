import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CATEGORY_TILE_IMAGES, STYLE_TILES } from "@/lib/browse-tiles";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/meta/browse-tiles
 *
 * Artwork for the search landing's two browse rows. Public — it exposes
 * nothing a browse request wouldn't already return.
 *
 * Both rows draw on static artwork (src/lib/browse-tiles.ts): style photos
 * shared with the home rail, and line-art garment illustrations for
 * categories.
 *
 * The only thing this endpoint needs the database for is which categories to
 * SHOW: it returns only those currently holding at least one listing, so the
 * row can't offer a tile that leads to an empty result. Same principle as the
 * website's inventory-driven facets (getAvailableFilterOptions in
 * src/lib/listingFilters.ts). The client keeps a static taxonomy fallback for
 * when this can't be reached.
 *
 * Response:
 *   200 { styles: [{name, image}], categories: [{name, image, count}] }
 */
export async function GET() {
    const rows = await prisma.listing.findMany({
        where: {
            status: "AVAILABLE",
            moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
        },
        select: { category: true },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
        if (!row.category) continue;
        counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }

    const categories = [...counts.entries()]
        .map(([name, count]) => ({
            name,
            // null for a category with no artwork — the client renders a
            // labelled panel rather than a broken image.
            image: CATEGORY_TILE_IMAGES[name] ?? null,
            count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
        styles: STYLE_TILES.map((s) => ({ name: s.name, image: s.image })),
        categories,
    });
}
