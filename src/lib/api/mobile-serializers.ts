/**
 * Mobile-facing serializers. Returns slim JSON that matches the Flutter
 * data models exactly — no Prisma Decimals, no internal columns, ISO
 * timestamps. Keep these in sync with `modaire_app/lib/core/listings/`.
 *
 * Why a separate serializer from src/lib/serialization.ts:
 *  - The website's serializeListing leaks every column (including admin
 *    fields like rejection_reason / reviewed_by_id) — fine for server →
 *    client component handoff, wasteful on mobile bandwidth.
 *  - Mobile clients are versioned via the App Store. Pinning the shape
 *    here lets us evolve internal columns without breaking old installs.
 */

import type { Prisma } from "@prisma/client";
import { getListingRejectionMessage } from "@/lib/listing-rejection-reasons";

type ListingImageRow = {
    /** Only present when the caller includes `id: true` in its image select.
     *  The seller-detail endpoint does (the seller photo editor needs it);
     *  most browse-side endpoints don't, to keep responses lean. */
    id?: string;
    imageUrl: string;
    thumbUrl: string | null;
    mediumUrl: string | null;
    imageOrder: number;
};

type ListingWithImages = {
    id: string;
    title: string;
    description: string;
    price: Prisma.Decimal | number;
    image_url: string;
    style: string;
    category: string;
    subcategory: string | null;
    type: string | null;
    condition: string | null;
    brand: string | null;
    size: string | null;
    status: string;
    moderation_status: string;
    is_featured: boolean;
    view_count: number;
    created_at: Date;
    images: ListingImageRow[];
};

type SellerRow = {
    id: string;
    first_name: string;
    last_name: string;
    profile_image: string | null;
};

type PurchaseWithListing = {
    id: string;
    amount: Prisma.Decimal | number;
    payment_intent_id: string | null;
    created_at: Date;
    listing: ListingWithImages & {
        user: {
            id: string;
            first_name: string;
            last_name: string;
        };
    };
    order: {
        order_status: string;
        shipping_status: string;
        shipping_stage: string;
        carrier: string | null;
        tracking_number: string | null;
        shipping_option_amount: string | null;
        shipped_at: Date | null;
        delivered_at: Date | null;
    } | null;
};

function deriveOrderStatus(p: PurchaseWithListing): string {
    const o = p.order;
    if (!o) return "PROCESSING";
    if (o.order_status === "REFUNDED") return "REFUNDED";
    if (o.order_status === "CANCELLED") return "CANCELLED";
    if (o.shipping_status === "DELIVERED") return "DELIVERED";
    if (o.shipping_status === "SHIPPED") return "SHIPPED";
    if (o.shipping_status === "RETURNED") return "RETURNED";
    return "PROCESSING";
}

type SellerListingRow = ListingWithImages & {
    rejection_reason: string | null;
    purchases?: Array<{
        order: { shipping_status: string } | null;
    }>;
};

/**
 * Bucket a seller's own listing into one of four UI tabs:
 *   - active:  approved + still available
 *   - pending: awaiting moderation (or rejected — surfaces with reason)
 *   - sold:    sold + tracking lifecycle
 *   - (drafts are returned by a separate endpoint)
 */
function bucketForSellerListing(l: SellerListingRow): "active" | "pending" | "sold" {
    if (l.status === "SOLD") return "sold";
    if (
        l.moderation_status === "APPROVED" ||
        l.moderation_status === "PARTIAL_APPROVED"
    ) {
        return "active";
    }
    return "pending";
}

export function serializeSellerListingForMobile(l: SellerListingRow) {
    const img = primaryImageOf(l);
    const purchase = l.purchases?.[0];
    return {
        id: l.id,
        title: l.title,
        price: Number(l.price),
        category: l.category,
        size: l.size,
        brand: l.brand,
        condition: l.condition,
        status: l.status, // AVAILABLE | SOLD
        moderationStatus: l.moderation_status,
        rejectionReason: getListingRejectionMessage(l.rejection_reason) || null,
        bucket: bucketForSellerListing(l),
        shippingStatus: purchase?.order?.shipping_status ?? null,
        thumbUrl: img.thumbUrl ?? img.imageUrl,
        mediumUrl: img.mediumUrl ?? img.imageUrl,
        createdAt: l.created_at.toISOString(),
    };
}

/**
 * Full editable payload for the seller's own listing — extends the
 * summary with description, taxonomy, and the ordered image gallery so
 * the edit screen can render the entire current state.
 *
 * Listings don't have a dedicated `measurements` column on the website
 * either — measurements live appended to the description with a marker
 * (see splitDescriptionAndMeasurements in src/app/listings/[id]/page.tsx).
 * For v1 the mobile edit screen edits the raw description, so we don't
 * expose a separate measurements field here.
 */
export function serializeSellerListingDetailForMobile(l: SellerListingRow) {
    const summary = serializeSellerListingForMobile(l);
    const sortedImages = [...l.images].sort(
        (a, b) => a.imageOrder - b.imageOrder,
    );
    return {
        ...summary,
        description: l.description,
        subcategory: l.subcategory,
        type: l.type,
        style: l.style,
        images: sortedImages.map((img) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            thumbUrl: img.thumbUrl,
            mediumUrl: img.mediumUrl,
            imageOrder: img.imageOrder,
        })),
    };
}

type DraftRow = {
    id: string;
    title: string | null;
    style: string | null;
    category: string | null;
    subcategory: string | null;
    type: string | null;
    price: string | null;
    brand: string | null;
    description: string | null;
    condition: string | null;
    size: string | null;
    measurements: string | null;
    photo_urls: string[];
    generated_image_urls: string[];
    created_at: Date;
    updated_at: Date;
};

export function serializeDraftForMobile(d: DraftRow) {
    return {
        id: d.id,
        title: d.title ?? "",
        style: d.style ?? "",
        category: d.category ?? "",
        subcategory: d.subcategory ?? "",
        type: d.type ?? "",
        price: d.price ?? "",
        brand: d.brand ?? "",
        description: d.description ?? "",
        condition: d.condition ?? "",
        size: d.size ?? "",
        measurements: d.measurements ?? "",
        photoUrls: d.photo_urls,
        generatedImageUrls: d.generated_image_urls,
        updatedAt: d.updated_at.toISOString(),
        createdAt: d.created_at.toISOString(),
    };
}

/** Mobile-shape buyer order summary. */
export function serializeOrderForMobile(p: PurchaseWithListing) {
    const itemPrice = Number(p.listing.price);
    const shippingAmount =
        p.order?.shipping_option_amount != null
            ? Number(p.order.shipping_option_amount)
            : null;
    const total = Number(p.amount);
    const img = primaryImageOf(p.listing);
    return {
        id: p.id,
        status: deriveOrderStatus(p),
        total,
        itemPrice,
        shippingAmount,
        trackingNumber: p.order?.tracking_number ?? null,
        carrier: p.order?.carrier ?? null,
        shippedAt: p.order?.shipped_at?.toISOString() ?? null,
        deliveredAt: p.order?.delivered_at?.toISOString() ?? null,
        createdAt: p.created_at.toISOString(),
        listing: {
            id: p.listing.id,
            title: p.listing.title,
            category: p.listing.category,
            size: p.listing.size,
            brand: p.listing.brand,
            thumbUrl: img.thumbUrl ?? img.imageUrl,
            mediumUrl: img.mediumUrl ?? img.imageUrl,
            status: p.listing.status,
        },
        seller: {
            id: p.listing.user.id,
            firstName: p.listing.user.first_name,
            lastName: p.listing.user.last_name,
        },
    };
}

type SellerSaleRow = {
    id: string;
    amount: Prisma.Decimal | number;
    created_at: Date;
    buyer: {
        id: string;
        first_name: string;
        last_name: string;
    };
    listing: {
        id: string;
        title: string;
        images: ListingImageRow[];
    };
    order: {
        id: string;
        shipping_status: string;
        shipping_stage: string;
        tracking_number: string | null;
        carrier: string | null;
        label_url: string | null;
    } | null;
};

/**
 * Bucket a seller sale into one of four UI states matching the
 * website's SalesClient overlay:
 *   - DELIVERED        — green pill, no actions
 *   - SHIPPED          — blue pill, Track button
 *   - PROCESSING       — amber pill, Print Label (label already bought)
 *   - ACTION_REQUIRED  — buyer hasn't picked / no label yet → Generate Label
 */
function deriveSaleStatus(s: SellerSaleRow): string {
    const o = s.order;
    if (!o) return "ACTION_REQUIRED";
    if (o.shipping_status === "DELIVERED") return "DELIVERED";
    if (o.shipping_status === "SHIPPED") return "SHIPPED";
    if (o.label_url) return "PROCESSING";
    return "ACTION_REQUIRED";
}

export function serializeSellerSaleForMobile(s: SellerSaleRow) {
    const img = primaryImageOf({
        ...s.listing,
        // primaryImageOf only needs images + image_url; supply a fallback.
        image_url: s.listing.images[0]?.imageUrl ?? "",
    } as unknown as ListingWithImages);
    return {
        id: s.id,
        orderId: s.order?.id ?? null,
        amount: Number(s.amount),
        status: deriveSaleStatus(s),
        shippingStatus: s.order?.shipping_status ?? null,
        shippingStage: s.order?.shipping_stage ?? null,
        trackingNumber: s.order?.tracking_number ?? null,
        carrier: s.order?.carrier ?? null,
        labelUrl: s.order?.label_url ?? null,
        createdAt: s.created_at.toISOString(),
        listing: {
            id: s.listing.id,
            title: s.listing.title,
            thumbUrl: img.thumbUrl ?? img.imageUrl,
            mediumUrl: img.mediumUrl ?? img.imageUrl,
        },
        buyer: {
            id: s.buyer.id,
            firstName: s.buyer.first_name,
            lastName: s.buyer.last_name,
        },
    };
}

type AdminListingRow = ListingWithImages & {
    featured_order: number | null;
    rejection_reason: string | null;
    user: {
        id: string;
        first_name: string;
        last_name: string;
    };
};

/**
 * Admin moderation card — everything the listings-moderation, featured-
 * manager, and reject-with-reason flows need in a single row.
 */
export function serializeAdminListingForMobile(l: AdminListingRow) {
    const img = primaryImageOf(l);
    return {
        id: l.id,
        title: l.title,
        price: Number(l.price),
        category: l.category,
        subcategory: l.subcategory,
        style: l.style,
        type: l.type,
        size: l.size,
        brand: l.brand,
        condition: l.condition,
        status: l.status,
        moderationStatus: l.moderation_status,
        rejectionReason: getListingRejectionMessage(l.rejection_reason) || null,
        isFeatured: l.is_featured,
        featuredOrder: l.featured_order,
        createdAt: l.created_at.toISOString(),
        sellerId: l.user.id,
        sellerName: `${l.user.first_name} ${l.user.last_name}`.trim(),
        thumbUrl: img.thumbUrl ?? img.imageUrl,
        mediumUrl: img.mediumUrl ?? img.imageUrl,
    };
}

type AdminOrderRow = {
    id: string;
    order_status: string;
    shipping_status: string;
    shipping_stage: string;
    carrier: string | null;
    tracking_number: string | null;
    label_url: string | null;
    created_at: Date;
    refund_id: string | null;
    refunded_at: Date | null;
    refund_reason: string | null;
    purchase: {
        id: string;
        amount: Prisma.Decimal | number;
        buyer: {
            id: string;
            first_name: string;
            last_name: string;
            email: string;
        } | null;
        listing: {
            id: string;
            title: string;
            images: ListingImageRow[];
            user: {
                id: string;
                first_name: string;
                last_name: string;
                email: string;
            };
        };
    };
};

/** Admin order list row — buyer/seller/listing/shipping + refund state. */
export function serializeAdminOrderForMobile(o: AdminOrderRow) {
    const img = primaryImageOf({
        ...o.purchase.listing,
        image_url: o.purchase.listing.images[0]?.imageUrl ?? "",
    } as unknown as ListingWithImages);
    return {
        id: o.id,
        amount: Number(o.purchase.amount),
        orderStatus: o.order_status,
        shippingStatus: o.shipping_status,
        shippingStage: o.shipping_stage,
        carrier: o.carrier,
        trackingNumber: o.tracking_number,
        labelUrl: o.label_url,
        createdAt: o.created_at.toISOString(),
        refundId: o.refund_id,
        refundedAt: o.refunded_at?.toISOString() ?? null,
        refundReason: o.refund_reason,
        listing: {
            id: o.purchase.listing.id,
            title: o.purchase.listing.title,
            thumbUrl: img.thumbUrl ?? img.imageUrl,
            mediumUrl: img.mediumUrl ?? img.imageUrl,
        },
        buyer: o.purchase.buyer
            ? {
                  id: o.purchase.buyer.id,
                  firstName: o.purchase.buyer.first_name,
                  lastName: o.purchase.buyer.last_name,
                  email: o.purchase.buyer.email,
              }
            : null,
        seller: {
            id: o.purchase.listing.user.id,
            firstName: o.purchase.listing.user.first_name,
            lastName: o.purchase.listing.user.last_name,
            email: o.purchase.listing.user.email,
        },
    };
}

function primaryImageOf(listing: ListingWithImages) {
    const sorted = [...listing.images].sort((a, b) => a.imageOrder - b.imageOrder);
    const head = sorted[0];
    return {
        imageUrl: head?.imageUrl ?? listing.image_url,
        thumbUrl: head?.thumbUrl ?? null,
        mediumUrl: head?.mediumUrl ?? null,
    };
}

/** Lightweight summary used on browse/search grids. */
export function serializeListingSummaryForMobile(listing: ListingWithImages) {
    const img = primaryImageOf(listing);
    return {
        id: listing.id,
        title: listing.title,
        price: Number(listing.price),
        brand: listing.brand,
        size: listing.size,
        condition: listing.condition,
        category: listing.category,
        style: listing.style,
        status: listing.status,
        isFeatured: listing.is_featured,
        thumbUrl: img.thumbUrl ?? img.imageUrl,
        mediumUrl: img.mediumUrl ?? img.imageUrl,
        createdAt: listing.created_at.toISOString(),
    };
}

/** Full payload for the listing detail screen. */
export function serializeListingDetailForMobile(
    listing: ListingWithImages,
    seller: SellerRow | null,
) {
    const sortedImages = [...listing.images].sort(
        (a, b) => a.imageOrder - b.imageOrder,
    );
    return {
        id: listing.id,
        title: listing.title,
        description: listing.description,
        price: Number(listing.price),
        brand: listing.brand,
        size: listing.size,
        condition: listing.condition,
        category: listing.category,
        subcategory: listing.subcategory,
        type: listing.type,
        style: listing.style,
        status: listing.status,
        isFeatured: listing.is_featured,
        viewCount: listing.view_count,
        createdAt: listing.created_at.toISOString(),
        images: sortedImages.map((img) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            thumbUrl: img.thumbUrl,
            mediumUrl: img.mediumUrl,
            imageOrder: img.imageOrder,
        })),
        seller: seller
            ? {
                  id: seller.id,
                  firstName: seller.first_name,
                  lastName: seller.last_name,
                  profileImage: seller.profile_image,
              }
            : null,
    };
}
