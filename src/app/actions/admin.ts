"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendListingApprovedEmail, sendListingRejectedEmail } from "@/lib/email";
import { createNotification } from "@/app/actions/notifications";

/**
 * Verifies the current user is an admin. Throws if not.
 */
async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Authentication required.");
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, is_admin: true },
    });

    if (!user?.is_admin) {
        throw new Error("Admin access required.");
    }

    return user;
}

const REFUND_HOLD_DAYS = 3;

function getHoldUntilDate(from: Date) {
    const holdUntil = new Date(from);
    holdUntil.setDate(holdUntil.getDate() + REFUND_HOLD_DAYS);
    return holdUntil;
}

export async function approveListing(listingId: string) {
    const admin = await requireAdmin();

    const updated = await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "APPROVED",
            status: "AVAILABLE",
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: null,
        },
        select: {
            id: true,
            title: true,
            user: {
                select: { id: true, email: true }
            }
        }
    });

    if (updated.user?.email) {
        void sendListingApprovedEmail(updated.user.email, updated.title);
    }

    await createNotification({
        userId: updated.user.id,
        type: "LISTING_APPROVED",
        title: `Listing approved: ${updated.title}`,
        body: "Your listing is now live on the marketplace.",
        linkUrl: `/listings/${updated.id}`,
    });

    revalidatePath("/admin/listings");
    revalidatePath("/browse");
    revalidatePath("/");
    return { success: true };
}

/**
 * Approve + curate onto the Home "New In" rail in one click. Same email and
 * same LISTING_APPROVED notification as plain approveListing — "featured" is
 * admin-side curation metadata, not customer-facing.
 */
export async function approveAndFeatureListing(listingId: string) {
    const admin = await requireAdmin();

    const updated = await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "APPROVED",
            status: "AVAILABLE",
            is_featured: true,
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: null,
        },
        select: {
            id: true,
            title: true,
            user: {
                select: { id: true, email: true }
            }
        }
    });

    if (updated.user?.email) {
        void sendListingApprovedEmail(updated.user.email, updated.title);
    }

    await createNotification({
        userId: updated.user.id,
        type: "LISTING_APPROVED",
        title: `Listing approved: ${updated.title}`,
        body: "Your listing is now live on the marketplace.",
        linkUrl: `/listings/${updated.id}`,
    });

    revalidatePath("/admin/listings");
    revalidatePath("/browse");
    revalidatePath("/");
    return { success: true };
}

/**
 * Admin-only curation toggle: promote/demote a listing from the Home "New In"
 * rail without touching moderation_status. No email, no notification — this
 * is a purely admin-facing curation flip.
 */
export async function setListingFeatured(listingId: string, featured: boolean) {
    await requireAdmin();

    await prisma.listing.update({
        where: { id: listingId },
        data: { is_featured: featured },
    });

    revalidatePath("/admin/listings");
    revalidatePath("/");
    return { success: true };
}

/**
 * Persists the admin-chosen ordering of the Home "Featured" rail. `orderedIds`
 * is the full ordered list the admin wants — index 0 is shown first on Home.
 * Each listing's `featured_order` is set to its array index; rows not in the
 * list are reset to NULL so they fall to the end of the rail (or off it once
 * more than 8 listings are featured). Runs in a transaction so the rail never
 * lands in a half-reordered state.
 */
export async function setFeaturedListingsOrder(orderedIds: string[]) {
    await requireAdmin();

    if (!Array.isArray(orderedIds)) {
        throw new Error("orderedIds must be an array.");
    }
    const cleanIds = Array.from(new Set(orderedIds.filter((id) => typeof id === "string" && id.length > 0)));

    await prisma.$transaction([
        // Reset every currently-ordered featured row first so any listing the
        // admin dropped from the rail loses its old slot.
        prisma.listing.updateMany({
            where: { is_featured: true },
            data: { featured_order: null },
        }),
        ...cleanIds.map((id, index) =>
            prisma.listing.update({
                where: { id },
                data: { featured_order: index, is_featured: true },
            })
        ),
    ]);

    revalidatePath("/admin/featured");
    revalidatePath("/");
    return { success: true };
}

/**
 * Partial-accept: listing becomes visible on Explore (pushed to the end) but
 * is excluded from the Home page feeds. No email is sent and the seller sees
 * the listing as "Active" in their dashboard — same surface area as a fully
 * approved listing, with only ranking differences.
 */
export async function partiallyApproveListing(listingId: string) {
    const admin = await requireAdmin();

    await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "PARTIAL_APPROVED",
            status: "AVAILABLE",
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: null,
        },
    });

    revalidatePath("/admin/listings");
    revalidatePath("/browse");
    revalidatePath("/");
    return { success: true };
}

/**
 * Rejects a listing with an optional reason.
 */
export async function rejectListing(listingId: string, reason?: string) {
    const admin = await requireAdmin();

    const updated = await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "REJECTED",
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: reason || null,
        },
        select: {
            id: true,
            title: true,
            user: {
                select: { id: true, email: true }
            }
        }
    });

    if (updated.user?.email && reason) {
        void sendListingRejectedEmail(updated.user.email, updated.title, reason);
    }

    await createNotification({
        userId: updated.user.id,
        type: "LISTING_REJECTED",
        title: `Listing rejected: ${updated.title}`,
        body: reason ? `Reason: ${reason}` : "Edit the listing and resubmit for review.",
        linkUrl: "/sell",
    });

    revalidatePath("/admin/listings");
    revalidatePath("/browse");
    return { success: true };
}

/**
 * Updates shipping status for an order.
 */
export async function updateOrderShipping(
    orderId: string,
    data: {
        shippingStatus?: string;
        carrier?: string;
        trackingNumber?: string;
    }
) {
    await requireAdmin();

    const updateData: Record<string, unknown> = {};

    if (data.shippingStatus) {
        updateData.shipping_status = data.shippingStatus;

        if (data.shippingStatus === "SHIPPED") {
            updateData.shipped_at = new Date();
        }
        if (data.shippingStatus === "DELIVERED") {
            const deliveredAt = new Date();
            updateData.delivered_at = deliveredAt;
            updateData.hold_until = getHoldUntilDate(deliveredAt);
            updateData.order_status = "FULFILLED";
            updateData.seller_transfer_status = "PENDING_HOLD";
        }
    }

    if (data.carrier !== undefined) updateData.carrier = data.carrier;
    if (data.trackingNumber !== undefined) updateData.tracking_number = data.trackingNumber;

    await prisma.order.update({
        where: { id: orderId },
        data: updateData,
    });

    revalidatePath("/admin/orders");
    revalidatePath("/dashboard/purchases");
    return { success: true };
}

/**
 * Updates the imageOrder field for multiple listing images in a safe transaction.
 */
export async function updateListingImagesOrder(
    listingId: string,
    imageIdsInNewOrder: string[]
) {
    await requireAdmin();

    // Perform database updates inside a safe transaction to avoid unique constraint violations
    await prisma.$transaction(async (tx) => {
        // 1. Temporarily move all of this listing's images to negative orders (no unique conflict)
        const images = await tx.listingImage.findMany({
            where: { listingId },
            select: { id: true },
        });

        for (let i = 0; i < images.length; i++) {
            await tx.listingImage.update({
                where: { id: images[i].id },
                data: { imageOrder: -(i + 1) },
            });
        }

        // 2. Set the new positive orders based on the ordered array
        for (let idx = 0; idx < imageIdsInNewOrder.length; idx++) {
            await tx.listingImage.update({
                where: { id: imageIdsInNewOrder[idx] },
                data: { imageOrder: idx },
            });
        }
    });

    revalidatePath("/admin/listings");
    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/");
    revalidatePath("/browse");
    
    return { success: true };
}
