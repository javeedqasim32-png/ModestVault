import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { serializeListingSummaryForMobile } from "@/lib/api/mobile-serializers";
import { getEffectivePricesForListings } from "@/lib/promotions/get-effective-price";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/cart
 *
 * Returns the user's cart contents as full mobile-shape summaries plus a
 * computed subtotal so the bag screen can render the line items and the
 * total without a second roundtrip.
 *
 * Cart items whose listing has gone unavailable (sold from under us) stay
 * in the response and are flagged via `status: "SOLD"` so the UI can mark
 * them and offer a remove button.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await prisma.cartItem.findMany({
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
                    user: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            profile_image: true,
                        },
                    },
                },
            },
        },
    });

    const priceMap = await getEffectivePricesForListings(
        rows.map((row) => ({
            id: row.listing.id,
            price: row.listing.price,
            status: row.listing.status,
        })),
    );

    const items = rows.map((row) => ({
        cartItemId: row.id,
        listing: serializeListingSummaryForMobile(row.listing, {
            effectivePrice: priceMap.get(row.listing.id),
        }),
        // Mobile cart UI groups by seller and renders one section per
        // seller (with a "Ships from <Seller>" subtitle), so we attach
        // the seller summary inline rather than making the client do a
        // second roundtrip per row.
        seller: {
            id: row.listing.user.id,
            firstName: row.listing.user.first_name,
            lastName: row.listing.user.last_name,
            profileImage: row.listing.user.profile_image,
        },
        addedAt: row.created_at.toISOString(),
    }));

    // Sum the discounted price where a campaign applies, so the cart
    // subtotal reconciles with what the PaymentIntent actually charges
    // (createPaymentIntentFor*ByUserId resolves the same effective price).
    const subtotalCents = items.reduce((sum, it) => {
        if (it.listing.status !== "AVAILABLE") return sum;
        return (
            sum +
            (it.listing.effectivePrice?.effectiveCents ??
                Math.round(it.listing.price * 100))
        );
    }, 0);

    return NextResponse.json({
        items,
        subtotal: subtotalCents / 100,
        currency: "USD",
    });
}
