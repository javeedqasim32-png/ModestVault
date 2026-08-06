import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { serializeListingSummaryForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/listings
 *
 * Public browse — no Bearer required, mirrors the website's /browse page
 * which is also public. Mobile filter panel maps to comma-separated
 * multi-select query params (styles=Western,Bridals).
 *
 * Ordering: featured first (by featured_order), then newest. Only
 * APPROVED + PARTIAL_APPROVED + AVAILABLE listings surface.
 *
 * Query params:
 *   cursor       listing id; rows strictly after are returned
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

const QuerySchema = z.object({
    cursor: z.string().uuid().optional(),
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

    const rows = await prisma.listing.findMany({
        where,
        orderBy: [
            { is_featured: "desc" },
            { featured_order: { sort: "asc", nulls: "last" } },
            { created_at: "desc" },
            { id: "asc" },
        ],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
        },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return NextResponse.json({
        listings: page.map(serializeListingSummaryForMobile),
        nextCursor,
    });
}
