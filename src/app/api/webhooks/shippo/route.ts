import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTrackingUpdateEmail, sendDeliveryNotificationEmail } from "@/lib/email";
import { createNotification } from "@/app/actions/notifications";

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        
        // Shippo delivers track updates with event: "track_updated"
        if (payload.event !== "track_updated" || !payload.data) {
            return NextResponse.json({ received: true });
        }

        const trackData = payload.data;
        const trackingNumber = trackData.tracking_number;
        const status = trackData.tracking_status?.status; // e.g., "DELIVERED", "TRANSIT", "FAILURE"
        const carrier = trackData.carrier;

        if (!trackingNumber || !status) {
            return NextResponse.json({ error: "Missing tracking data" }, { status: 400 });
        }

        // 1. Find the order with this tracking number
        const order = await prisma.order.findFirst({
            where: { tracking_number: trackingNumber },
            include: {
                purchase: {
                    include: {
                        listing: {
                            include: { user: true } // seller
                        },
                        buyer: true
                    }
                }
            }
        });

        if (!order) {
            console.log(`⚠️ Shippo Webhook: No order found for tracking number ${trackingNumber}`);
            return NextResponse.json({ received: true });
        }

        const buyerEmail = order.purchase.buyer.email;
        const buyerId = order.purchase.buyer.id;
        const sellerEmail = order.purchase.listing.user.email;
        const sellerId = order.purchase.listing.user.id;
        const listingTitle = order.purchase.listing.title;

        // 2. Map Shippo status to our database status
        let newStatus = order.shipping_status;
        let deliveredAt: Date | null = null;

        if (status === "DELIVERED") {
            newStatus = "DELIVERED";
            deliveredAt = new Date();
        } else if (status === "TRANSIT") {
            newStatus = "SHIPPED";
        } else if (status === "PRE_TRANSIT") {
            newStatus = "PROCESSING";
        } else if (status === "FAILURE" || status === "RETURNED") {
            newStatus = "RETURNED";
        }

        // 3. Update the order in the database
        await prisma.order.update({
            where: { id: order.id },
            data: {
                shipping_status: newStatus,
                delivered_at: deliveredAt || undefined,
                updated_at: new Date()
            }
        });

        // 4. Send the appropriate email
        if (status === "DELIVERED") {
            await sendDeliveryNotificationEmail(buyerEmail, sellerEmail, listingTitle);
            await createNotification({
                userId: sellerId,
                type: "ITEM_DELIVERED",
                title: `Delivered: ${listingTitle}`,
                body: "Payout releases in 3 days per the standard refund hold.",
                linkUrl: "/dashboard/sales",
            });
            await createNotification({
                userId: buyerId,
                type: "ORDER_DELIVERED",
                title: `Delivered: ${listingTitle}`,
                body: "Your order has arrived. Enjoy!",
                linkUrl: "/dashboard/purchases",
            });
        } else {
            const displayStatus = trackData.tracking_status?.status_details || status;
            await sendTrackingUpdateEmail(buyerEmail, listingTitle, displayStatus, trackingNumber, carrier);
        }

        console.log(`✅ Shippo Webhook Processed: Order ${order.id} is now ${status}`);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("❌ Shippo Webhook Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
