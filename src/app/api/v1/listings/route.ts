import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { serializeListingSummaryForMobile } from "@/lib/api/mobile-serializers";
import { getEffectivePricesForListings } from "@/lib/promotions/get-effective-price";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/listings
 *
 * Public browse — no Bearer required, mirrors the website's /browse page
 * which is also public. Mobile filter panel maps to comma-separated
 * multi-select query params (styles=Western,Bridals).
 *
 * Ordering: featured-overflow, then the rest of approved, then
 * partial-approved — newest first within each tier. Mirrors the website's
 * /browse page exactly. Only APPROVED + PARTIAL_APPROVED + AVAILABLE
 * listings surface.
 *
 * Query params:
 *   cursor       opaque pagination token from a prior nextCursor
 *   limit        1..50, default 24
 *   search       case-insensitive ILIKE across title/description/brand
 *   styles       CSV (single or multiple)  — e.g. "Western,Bridals"
 *   categories   CSV (single or multiple)  — e.g. "Suits,Dresses"
 *   sizes        CSV — e.g. "Small,Medium"
 *   conditions   CSV — e.g. "Like new,Good"
 *   minPrice     number (USD)
 *   maxPrice     number (USD)
 */
const csv = z
    .string()
    .trim()
    .min(1)
    .max(400)
    .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean));

/** Size of the Home screen's featured rail. Featured listings that rank
 *  below this on Home are the "overflow" that gets boosted to the top of
 *  Explore — see the tier comment in GET. Mirrors FEATURED_LIMIT in
 *  src/app/api/v1/home/route.ts and `take: 8` in src/app/browse/page.tsx. */
const HOME_FEATURED_LIMIT = 8;

const QuerySchema = z.object({
    // Offset into the tiered id list, not a listing id. Which tier a listing
    // lands in depends on the Home top-8 set rather than on the row itself,
    // so there's no column to key a row-comparison cursor off. The client
    // treats nextCursor as opaque and echoes it back, so the format is ours.
    // Kept as a loose string (not z.coerce.number) so installed builds that
    // still send a listing id get resolved by position instead of a 400 —
    // see the `start` resolution in GET.
    cursor: z.string().trim().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(24),
    search: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(80).optional(), // legacy single
    styles: csv.optional(),
    categories: csv.optional(),
    sizes: csv.optional(),
    conditions: csv.optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
});

export async function GET(req: NextRequest) {
    const parsed = QuerySchema.safeParse(
        Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) {
        // Zod's fieldErrors is Record<string, string[]|undefined>; apiError
        // wants one message per field. Take the first message and skip
        // empty arrays.
        const rawFields = parsed.error.flatten().fieldErrors;
        const fields: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(rawFields)) {
            if (msgs && msgs.length > 0) fields[key] = msgs[0];
        }
        return apiError("INVALID_INPUT", "Invalid query parameters.", fields);
    }
    const {
        cursor,
        limit,
        search,
        category: singleCategory,
        styles,
        categories: multiCategories,
        sizes,
        conditions,
        minPrice,
        maxPrice,
    } = parsed.data;

    const categories = multiCategories ?? (singleCategory ? [singleCategory] : null);

    const where: Prisma.ListingWhereInput = {
        status: "AVAILABLE",
        moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
        ...(categories && categories.length > 0
            ? { category: { in: categories } }
            : {}),
        ...(styles && styles.length > 0 ? { style: { in: styles } } : {}),
        ...(sizes && sizes.length > 0 ? { size: { in: sizes } } : {}),
        ...(conditions && conditions.length > 0
            ? { condition: { in: conditions } }
            : {}),
        ...(minPrice != null || maxPrice != null
            ? {
                  price: {
                      ...(minPrice != null ? { gte: minPrice } : {}),
                      ...(maxPrice != null ? { lte: maxPrice } : {}),
                  },
              }
            : {}),
        ...(search
            ? {
                  OR: [
                      { title: { contains: search, mode: "insensitive" as const } },
                      { description: { contains: search, mode: "insensitive" as const } },
                      { brand: { contains: search, mode: "insensitive" as const } },
                  ],
              }
            : {}),
    };

    // Explore ordering has three tiers, matching src/app/browse/page.tsx:
    //   1. featured overflow — is_featured but ranked below the Home rail's
    //      top 8, so those listings still surface somewhere prominent
    //   2. the rest of the approved tier (incl. featured already on Home,
    //      which keep their natural date position — they're prominent there)
    //   3. partial-approved, always last
    // Within every tier: newest first.
    //
    // Tier 1 can't be expressed as a Prisma orderBy — it depends on a NOT IN
    // over the Home top-8 set, and orderBy has no CASE. So we partition in
    // memory over an id-only projection (the website does the same over full
    // rows), then hydrate just the page the client asked for.
    const [idRows, homeTopFeatured] = await Promise.all([
        prisma.listing.findMany({
            where,
            orderBy: [{ created_at: "desc" }, { id: "asc" }],
            select: { id: true, is_featured: true, moderation_status: true },
        }),
        prisma.listing.findMany({
            where: {
                is_featured: true,
                moderation_status: "APPROVED",
                status: "AVAILABLE",
            },
            orderBy: [
                { featured_order: { sort: "asc", nulls: "last" } },
                { created_at: "desc" },
            ],
            take: HOME_FEATURED_LIMIT,
            select: { id: true },
        }),
    ]);

    const homeTopIds = new Set(homeTopFeatured.map((r) => r.id));
    const approved = idRows.filter((r) => r.moderation_status === "APPROVED");
    const orderedIds = [
        ...approved.filter((r) => r.is_featured && !homeTopIds.has(r.id)),
        ...approved.filter((r) => !r.is_featured || homeTopIds.has(r.id)),
        ...idRows.filter((r) => r.moderation_status === "PARTIAL_APPROVED"),
    ].map((r) => r.id);

    // Offset tokens are what we hand out now. A listing id means an older
    // install is paginating against the previous keyset contract — resolve it
    // by position so it keeps working. An id we can't find (sold or delisted
    // mid-scroll) ends the feed rather than restarting at 0, which would loop
    // the client's infinite scroll forever.
    const start = !cursor
        ? 0
        : /^\d+$/.test(cursor)
          ? Number(cursor)
          : orderedIds.indexOf(cursor) >= 0
            ? orderedIds.indexOf(cursor) + 1
            : orderedIds.length;

    const pageIds = orderedIds.slice(start, start + limit);
    const nextCursor =
        start + limit < orderedIds.length ? String(start + limit) : null;

    const rows = pageIds.length
        ? await prisma.listing.findMany({
              where: { id: { in: pageIds } },
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
          })
        : [];

    // `in` doesn't preserve order — re-sequence to the tiered id list.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const page = pageIds
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => r != null);

    // One bulk query for the whole page — same helper checkout uses, so the
    // discounted price on the tile is the price the buyer is charged.
    const priceMap = await getEffectivePricesForListings(
        page.map((l) => ({ id: l.id, price: l.price, status: l.status })),
    );

    return NextResponse.json({
        listings: page.map((l) =>
            serializeListingSummaryForMobile(l, { effectivePrice: priceMap.get(l.id) }),
        ),
        nextCursor,
    });
}
