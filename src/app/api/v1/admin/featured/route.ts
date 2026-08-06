import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { serializeAdminListingForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/featured
 *
 * Returns every is_featured listing in admin-chosen order. featured_order
 * NULL sorts after numeric values so dropping a listing off the rail
 * naturally pushes it to the bottom.
 */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const rows = await prisma.listing.findMany({
        where: { is_featured: true },
        orderBy: [{ featured_order: "asc" }, { created_at: "desc" }],
        include: {
            user: { select: { id: true, first_name: true, last_name: true } },
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
    });

    return NextResponse.json({
        featured: rows.map((r) =>
            serializeAdminListingForMobile(
                r as unknown as Parameters<typeof serializeAdminListingForMobile>[0],
            ),
        ),
    });
}

const schema = z.object({ ids: z.array(z.string().min(1)).max(64) });

/**
 * PUT /api/v1/admin/featured
 *
 * Body: `{ ids: string[] }` — the new full ordered list of featured
 * listings. Mirrors setFeaturedListingsOrder: resets every currently-
 * featured row's featured_order, then re-assigns positions by index
 * inside a single transaction.
 */
export async function PUT(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = await parseJsonBody(req, schema);
    if (parsed instanceof NextResponse) return parsed;
    const cleanIds = Array.from(new Set(parsed.ids));

    await prisma.$transaction([
        prisma.listing.updateMany({
            where: { is_featured: true },
            data: { featured_order: null },
        }),
        ...cleanIds.map((id, index) =>
            prisma.listing.update({
                where: { id },
                data: { featured_order: index, is_featured: true },
            }),
        ),
    ]);

    return NextResponse.json({ success: true });
}
