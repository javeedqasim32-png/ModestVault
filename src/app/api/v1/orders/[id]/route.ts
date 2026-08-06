import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { serializeOrderForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/orders/[id]
 *
 * Buyer-only — the Purchase must belong to the calling user, otherwise
 * 404 (not 403) so we don't leak which order ids exist.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: {
            order: true,
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
                    user: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                        },
                    },
                },
            },
        },
    });

    if (!purchase || purchase.buyer_id !== principal.id) {
        return apiError("NOT_FOUND", "Order not found.");
    }

    return NextResponse.json({
        order: serializeOrderForMobile(
            purchase as unknown as Parameters<typeof serializeOrderForMobile>[0],
        ),
    });
}
