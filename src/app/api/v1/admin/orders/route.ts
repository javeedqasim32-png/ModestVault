import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-auth";
import { serializeAdminOrderForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/orders
 *
 * Returns every order in the system, newest first, with full buyer,
 * seller, listing, shipping, and refund context. Mirrors the data the
 * web AdminOrdersClient renders. No paging yet — admin volume is low.
 */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const rows = await prisma.order.findMany({
        orderBy: { created_at: "desc" },
        select: {
            id: true,
            order_status: true,
            shipping_status: true,
            shipping_stage: true,
            carrier: true,
            tracking_number: true,
            label_url: true,
            created_at: true,
            refund_id: true,
            refunded_at: true,
            refund_reason: true,
            purchase: {
                select: {
                    id: true,
                    amount: true,
                    buyer: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true,
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
                            user: {
                                select: {
                                    id: true,
                                    first_name: true,
                                    last_name: true,
                                    email: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    return NextResponse.json({
        orders: rows.map((r) =>
            serializeAdminOrderForMobile(
                r as unknown as Parameters<typeof serializeAdminOrderForMobile>[0],
            ),
        ),
    });
}
