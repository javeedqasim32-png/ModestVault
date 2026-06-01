import { serializeListing } from "@/lib/serialization";
import { auth } from "@/auth";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import SellPageClient from "./SellPageClient";

type SellAnalytics = {
    totalListings: number;
    deliveredRevenue: number;
    activeListings: number;
    averagePrice: number;
    soldListings: number;
    pendingListings: number;
};

export default async function SellPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const createParam = Array.isArray(params.create) ? params.create[0] : params.create;
    const manageParam = Array.isArray(params.manage) ? params.manage[0] : params.manage;
    const editParam = Array.isArray(params.edit) ? params.edit[0] : params.edit;
    const openCreateInitially = createParam === "1" || createParam === "true";
    const openManageInitially = manageParam === "1" || manageParam === "true";
    const editListingIdInitially = typeof editParam === "string" && editParam.length > 0 ? editParam : null;
    const session = await auth();

    // If logged-out user clicks Sell, redirect them to login/signup
    if (!session?.user?.id) {
        redirect("/login?callbackUrl=/sell");
    }

    // Stripe onboarding is no longer required to list — anyone signed in can sell.
    // We still verify the user exists in the DB; payout-pending state is handled
    // post-sale via the UnpaidEarningsBanner and the AWAITING_SELLER_STRIPE flow.
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true },
    });

    if (!user) {
        redirect("/login?callbackUrl=/sell");
    }

    const [listings, draftRows] = await Promise.all([
        prisma.listing.findMany({
            where: { user_id: session.user.id },
            orderBy: { created_at: "desc" },
            include: {
                images: {
                    orderBy: { imageOrder: "asc" },
                    take: 1,
                    select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
                },
                purchases: {
                    include: { order: true },
                    take: 1
                }
            },
        }),
        prisma.draft.findMany({
            where: { user_id: session.user.id },
            orderBy: { updated_at: "desc" },
        }),
    ]);

    // Drafts are server-rendered alongside listings so they're always present
    // on the initial paint of /sell. Previously they were hydrated client-side
    // via useEffect, which could lose the race with auth-cookie hydration
    // after a logout/login round-trip and leave the drafts list empty until
    // pull-to-refresh.
    const initialDrafts = draftRows.map((row) => ({
        id: row.id,
        title: row.title ?? "",
        style: row.style ?? "",
        category: row.category ?? "",
        subcategory: row.subcategory ?? "",
        listingType: row.type ?? "",
        price: row.price ?? "",
        brand: row.brand ?? "",
        description: row.description ?? "",
        condition: row.condition ?? "",
        size: row.size ?? "",
        measurements: row.measurements ?? "",
        photoUrls: row.photo_urls,
        generatedImageUrls: row.generated_image_urls,
        savedAt: row.updated_at.getTime(),
    }));

    const safeListings = listings.map((listing) => {
        const order = listing.purchases?.[0]?.order;
        const serialized = serializeListing(listing);
        return {
            id: serialized.id,
            title: serialized.title,
            description: serialized.description,
            price: serialized.price,
            created_at: serialized.created_at,
            updated_at: serialized.updated_at,
            style: serialized.style,
            category: serialized.category,
            subcategory: serialized.subcategory,
            type: serialized.type,
            condition: serialized.condition,
            brand: serialized.brand,
            size: serialized.size,
            status: serialized.status,
            moderation_status: serialized.moderation_status,
            rejection_reason: serialized.rejection_reason,
            image_url: getPrimaryListingImage(listing, "card"),
            label_url: order?.label_url || null,
        };
    });

    const analytics: SellAnalytics = (() => {
        const totalListings = listings.length;
        const activeListings = listings.filter(
            (listing) => listing.status === "AVAILABLE" && listing.moderation_status === "APPROVED"
        ).length;
        const soldListings = listings.filter((listing) => listing.status === "SOLD").length;
        const pendingListings = listings.filter((listing) => listing.moderation_status === "PENDING").length;
        const totalPrice = listings.reduce((sum, listing) => sum + Number(listing.price), 0);
        const averagePrice = totalListings > 0 ? totalPrice / totalListings : 0;
        const deliveredRevenue = listings.reduce((sum, listing) => {
            const purchase = listing.purchases?.[0];
            const order = purchase?.order;
            if (!purchase || !order) return sum;
            const isDelivered = order.shipping_status === "DELIVERED" || Boolean(order.delivered_at);
            return isDelivered ? sum + Number(purchase.amount) : sum;
        }, 0);

        return {
            totalListings,
            deliveredRevenue,
            activeListings,
            averagePrice,
            soldListings,
            pendingListings,
        };
    })();

    return (
        <SellPageClient
            currentUserId={session.user.id}
            listings={safeListings}
            initialDrafts={initialDrafts}
            openCreateInitially={openCreateInitially}
            openManageInitially={openManageInitially}
            editListingIdInitially={editListingIdInitially}
            analytics={analytics}
        />
    );
}
