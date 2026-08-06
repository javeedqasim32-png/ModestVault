import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { serializeOrderForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/orders
 *
 * Returns the signed-in user's purchases (most recent first) as
 * mobile-shape summaries. Powers the Orders tab.
 *
 * Each row is one Purchase (one listing). Bundle checkouts that
 * created multiple Purchases under one Stripe session still render
 * as N separate rows here — the mobile UX shows them individually so
 * the user can drill into each item's tracking / status independently.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await prisma.purchase.findMany({
        where: { buyer_id: principal.id },
        orderBy: { created_at: "desc" },
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

    return NextResponse.json({
        orders: rows.map((r) =>
            // Cast through unknown — the relation includes match the
            // PurchaseWithListing shape the serializer expects, but
            // Prisma's generated types don't quite line up due to
            // the Decimal vs number split.
            serializeOrderForMobile(r as unknown as Parameters<typeof serializeOrderForMobile>[0]),
        ),
    });
}
