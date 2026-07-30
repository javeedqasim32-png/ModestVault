import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminPromoCodesClient from "./AdminPromoCodesClient";

export const dynamic = "force-dynamic";

export default async function AdminPromoCodesPage() {
    const session = await auth();
    if (!session?.user?.id) redirect("/login?callbackUrl=/admin/promo-codes");

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { is_admin: true },
    });
    if (!user?.is_admin) redirect("/");

    const rows = await (prisma as any).promotionCode.findMany({
        orderBy: { created_at: "desc" },
        select: {
            id: true,
            code: true,
            discount_percent: true,
            absorber: true,
            applies_to_listing_id: true,
            applies_to_buyer_id: true,
            max_redemptions: true,
            redemption_count: true,
            starts_at: true,
            expires_at: true,
            active: true,
            notes: true,
            created_at: true,
        },
    });

    const formattedCodes = rows.map((r: any) => ({
        id: r.id,
        code: r.code,
        discount_percent: r.discount_percent,
        absorber: r.absorber,
        applies_to_listing_id: r.applies_to_listing_id,
        applies_to_buyer_id: r.applies_to_buyer_id,
        max_redemptions: r.max_redemptions,
        redemption_count: r.redemption_count,
        starts_at: r.starts_at.toISOString(),
        expires_at: r.expires_at ? r.expires_at.toISOString() : null,
        active: r.active,
        notes: r.notes,
        created_at: r.created_at.toISOString(),
    }));

    return (
        <div className="mt-4">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-2">Promo Codes</h1>
            <p className="mb-8 text-sm text-muted-foreground">
                Buyer-facing codes. Discount comes out of Modaire&rsquo;s platform fee — seller still receives 85% of the original listing price.
            </p>
            <AdminPromoCodesClient initialCodes={formattedCodes} />
        </div>
    );
}
