import { serializeListing } from "@/lib/serialization";
import { auth } from "@/auth";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import { buildS3ImageUrl, getS3BucketName } from "@/lib/s3";
import { redirect } from "next/navigation";
import { getUnreadNotificationCountsByType } from "@/app/actions/notifications";
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
    const aiJobIdParam = Array.isArray(params.aiJobId) ? params.aiJobId[0] : params.aiJobId;
    // Arriving from the "AI cover ready" notification (or any link carrying an
    // aiJobId) implies the seller wants to land on the upload screen — auto-open
    // the create form regardless of whether `?create=1` is present.
    const openCreateInitially = createParam === "1" || createParam === "true" || (typeof aiJobIdParam === "string" && aiJobIdParam.length > 0);
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

    const [listings, draftRows, unreadCountsByType] = await Promise.all([
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
                    include: {
                        order: true,
                        // buyer info powers the "Message Buyer" CTA on sold-tab cards
                        buyer: { select: { id: true, first_name: true, last_name: true } },
                    },
                    take: 1
                }
            },
        }),
        prisma.draft.findMany({
            where: { user_id: session.user.id },
            orderBy: { updated_at: "desc" },
        }),
        // Server-side unread counts that drive the Sold and Pending tab
        // badges on the client. Replaces a brittle localStorage scheme that
        // didn't survive iOS Safari storage eviction. Counts come from the
        // Notification table so they're per-user, persistent, and sync across
        // devices.
        getUnreadNotificationCountsByType(["ITEM_SOLD", "LISTING_REJECTED"]),
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
        const purchase = listing.purchases?.[0];
        const order = purchase?.order;
        const buyer = (purchase as unknown as { buyer?: { id: string; first_name: string | null; last_name: string | null } } | undefined)?.buyer;
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
            // Shipping status from the associated Order — used by the seller's
            // sold-listing pill to show actual delivery progress (Processed /
            // Shipped / Delivered) instead of a plain "Sold" label.
            shipping_status: order?.shipping_status ?? null,
            // Buyer info powers the "Message Buyer" button on sold cards.
            buyer_id: buyer?.id ?? null,
            buyer_name: buyer ? `${buyer.first_name ?? ""} ${buyer.last_name ?? ""}`.trim() || null : null,
        };
    });

    const analytics: SellAnalytics = (() => {
        const totalListings = listings.length;
        const activeListings = listings.filter(
            (listing) =>
                listing.status === "AVAILABLE" &&
                (listing.moderation_status === "APPROVED" || listing.moderation_status === "PARTIAL_APPROVED")
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

    // Most-recent AI cover job (last hour) — lets the client resume polling on
    // an in-flight generation, or surface the result of one that completed
    // while the seller was off the page. Includes FAILED so we can show the
    // retry banner instead of silently dropping the error. We also hydrate the
    // reference image URLs + form fields the seller submitted so closing the
    // browser mid-generation doesn't wipe their uploaded photos / title / etc.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let initialAIJob: {
        id: string;
        status: string;
        resultImageUrl: string | null;
        errorMessage: string | null;
        title: string | null;
        category: string | null;
        subcategory: string | null;
        style: string | null;
        size: string | null;
        description: string | null;
        hijabRequired: boolean | null;
        modelSkinTone: string | null;
        referenceImageUrls: string[];
    } | null = null;
    try {
        const job = await (prisma as any).aICoverJob?.findFirst?.({
            where: {
                user_id: session.user.id,
                created_at: { gte: oneHourAgo },
            },
            orderBy: { created_at: "desc" },
            select: {
                id: true,
                status: true,
                result_image_url: true,
                error_message: true,
                title: true,
                category: true,
                subcategory: true,
                style: true,
                size: true,
                description: true,
                hijab_required: true,
                model_skin_tone: true,
                reference_image_keys: true,
            },
        });
        if (job) {
            const bucket = getS3BucketName();
            const refKeys: string[] = Array.isArray(job.reference_image_keys) ? job.reference_image_keys : [];
            const referenceImageUrls = bucket
                ? refKeys.map((key: string) => buildS3ImageUrl(key, bucket))
                : [];
            initialAIJob = {
                id: job.id,
                status: job.status,
                resultImageUrl: job.result_image_url ?? null,
                errorMessage: job.error_message ?? null,
                title: job.title ?? null,
                category: job.category ?? null,
                subcategory: job.subcategory ?? null,
                style: job.style ?? null,
                size: job.size ?? null,
                description: job.description ?? null,
                hijabRequired: typeof job.hijab_required === "boolean" ? job.hijab_required : null,
                modelSkinTone: job.model_skin_tone ?? null,
                referenceImageUrls,
            };
        }
    } catch (err) {
        // Stale prisma client without aICoverJob? Don't break the page.
        console.warn("[sell] AI job fetch failed (non-fatal)", err);
    }

    return (
        <SellPageClient
            currentUserId={session.user.id}
            listings={safeListings}
            initialDrafts={initialDrafts}
            initialUnreadSoldCount={unreadCountsByType["ITEM_SOLD"] ?? 0}
            initialUnreadRejectedCount={unreadCountsByType["LISTING_REJECTED"] ?? 0}
            openCreateInitially={openCreateInitially}
            openManageInitially={openManageInitially}
            editListingIdInitially={editListingIdInitially}
            initialAIJob={initialAIJob as any}
            analytics={analytics}
        />
    );
}
