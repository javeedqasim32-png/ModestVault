"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendListingApprovedEmail, sendListingRejectedEmail } from "@/lib/email";

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
            title: true,
            user: {
                select: { email: true }
            }
        }
    });

    if (updated.user?.email) {
        void sendListingApprovedEmail(updated.user.email, updated.title);
    }

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
            title: true,
            user: {
                select: { email: true }
            }
        }
    });

    if (updated.user?.email && reason) {
        void sendListingRejectedEmail(updated.user.email, updated.title, reason);
    }

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
