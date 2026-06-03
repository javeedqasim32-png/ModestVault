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

        // 1. Find every order with this tracking number. For a same-seller
        // bundle (multiple Orders sharing one batch_id / one Shippo label /
        // one tracking number), this returns N rows; we update and notify
        // for each so the buyer sees per-item delivery + the seller's payout
        // hold starts per item.
        const orders = await prisma.order.findMany({
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

        if (orders.length === 0) {
            console.log(`⚠️ Shippo Webhook: No order found for tracking number ${trackingNumber}`);
            return NextResponse.json({ received: true });
        }

        // 2. Map Shippo status to our database status
        let newStatus = orders[0].shipping_status;
        let deliveredAt: Date | null = null;
        // 3-day refund-hold floor for seller payouts. Mirrors the admin
        // manual-override path in updateOrderShipping (src/app/actions/admin.ts)
        // so the release cron can't immediately disburse funds the moment the
        // carrier reports delivery — buyer needs a window to flag issues.
        let holdUntil: Date | null = null;

        if (status === "DELIVERED") {
            newStatus = "DELIVERED";
            deliveredAt = new Date();
            holdUntil = new Date(deliveredAt.getTime() + 3 * 24 * 60 * 60 * 1000);
        } else if (status === "TRANSIT") {
            newStatus = "SHIPPED";
        } else if (status === "PRE_TRANSIT") {
            newStatus = "PROCESSING";
        } else if (status === "FAILURE" || status === "RETURNED") {
            newStatus = "RETURNED";
        }

        // 3. Update every matching order (bundle siblings share the same
        // tracking number, so updateMany covers them all in one query).
        await prisma.order.updateMany({
            where: { tracking_number: trackingNumber },
            data: {
                shipping_status: newStatus,
                delivered_at: deliveredAt || undefined,
                hold_until: holdUntil || undefined,
                updated_at: new Date()
            }
        });

        // 4. Fan out emails + notifications per Order so each listing the
        // buyer purchased gets its own delivered/tracking notice in the bell.
        if (status === "DELIVERED") {
            for (const o of orders) {
                const buyerEmail = o.purchase.buyer.email;
                const buyerId = o.purchase.buyer.id;
                const sellerEmail = o.purchase.listing.user.email;
                const sellerId = o.purchase.listing.user.id;
                const listingTitle = o.purchase.listing.title;
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
            }
        } else {
            // Tracking-update email: send once per Order so the buyer sees the
            // milestone for each item separately in their inbox.
            const displayStatus = trackData.tracking_status?.status_details || status;
            for (const o of orders) {
                const buyerEmail = o.purchase.buyer.email;
                const listingTitle = o.purchase.listing.title;
                await sendTrackingUpdateEmail(buyerEmail, listingTitle, displayStatus, trackingNumber, carrier);
            }
        }

        console.log(`✅ Shippo Webhook Processed: ${orders.length} order(s) now ${status}`);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("❌ Shippo Webhook Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
