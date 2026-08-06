import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-auth";
import { serializeAdminListingForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set([
    "PENDING",
    "APPROVED",
    "PARTIAL_APPROVED",
    "REJECTED",
]);

/**
 * GET /api/v1/admin/listings?status=PENDING
 *
 * Lists every listing in the requested moderation bucket, newest first.
 * Mirrors src/app/admin/listings/page.tsx — the client picks one of
 * four buckets and the same query runs for each.
 */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const status = (req.nextUrl.searchParams.get("status") || "PENDING").toUpperCase();
    if (!VALID_STATUSES.has(status)) {
        return NextResponse.json({ listings: [] });
    }

    const rows = await prisma.listing.findMany({
        where: { moderation_status: status },
        orderBy: { created_at: "desc" },
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
        listings: rows.map((r) =>
            serializeAdminListingForMobile(
                r as unknown as Parameters<typeof serializeAdminListingForMobile>[0],
            ),
        ),
    });
}
