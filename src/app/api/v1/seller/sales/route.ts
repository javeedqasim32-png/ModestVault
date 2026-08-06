import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { serializeSellerSaleForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/seller/sales
 *
 * Returns every purchase whose listing belongs to the calling seller —
 * one row per sold item, ordered newest first. Mirrors the website's
 * /dashboard/sales view (SalesClient.tsx). The client derives status
 * (DELIVERED / SHIPPED / PROCESSING / ACTION_REQUIRED) from the row;
 * no separate "buckets" endpoint needed.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await prisma.purchase.findMany({
        where: { listing: { user_id: principal.id } },
        orderBy: { created_at: "desc" },
        include: {
            order: {
                select: {
                    id: true,
                    shipping_status: true,
                    shipping_stage: true,
                    tracking_number: true,
                    carrier: true,
                    label_url: true,
                },
            },
            listing: {
                select: {
                    id: true,
                    title: true,
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
            buyer: {
                select: { id: true, first_name: true, last_name: true },
            },
        },
    });

    return NextResponse.json({
        sales: rows.map((r) =>
            serializeSellerSaleForMobile(
                r as unknown as Parameters<typeof serializeSellerSaleForMobile>[0],
            ),
        ),
    });
}
