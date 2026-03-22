"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

/**
 * Approves a listing for public visibility.
 */
export async function approveListing(listingId: string) {
    const admin = await requireAdmin();

    await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "APPROVED",
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

    await prisma.listing.update({
        where: { id: listingId },
        data: {
            moderation_status: "REJECTED",
            reviewed_at: new Date(),
            reviewed_by_id: admin.id,
            rejection_reason: reason || null,
        },
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
            updateData.delivered_at = new Date();
            updateData.order_status = "FULFILLED";
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
