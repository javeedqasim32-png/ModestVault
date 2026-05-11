import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Shippo statuses: UNKNOWN, PRE_TRANSIT, TRANSIT, DELIVERED, RETURNED, FAILURE
function mapShippoStatusToPrisma(shippoStatus: string): string {
    switch (shippoStatus) {
        case "PRE_TRANSIT":
            return "PROCESSING";
        case "TRANSIT":
            return "SHIPPED";
        case "DELIVERED":
            return "DELIVERED";
        case "RETURNED":
            return "RETURNED";
        case "FAILURE":
            return "CANCELLED";
        default:
            return "NOT_SHIPPED";
    }
}

const REFUND_HOLD_DAYS = 3;

function getHoldUntilDate(from: Date) {
    const holdUntil = new Date(from);
    holdUntil.setDate(holdUntil.getDate() + REFUND_HOLD_DAYS);
    return holdUntil;
}

export async function POST(req: Request) {
    try {
        const bodyText = await req.text();
        await headers();

        // In a strict production environment, you should verify the Shippo signature
        // const signature = headersList.get("x-shippo-signature");
        // const isVerified = verifyShippoSignature(bodyText, signature, process.env.SHIPPO_WEBHOOK_SECRET);
        // if (!isVerified) return new NextResponse("Invalid signature", { status: 401 });

        const payload = JSON.parse(bodyText);

        // Shippo sends 'track_updated' event
        if (payload.event === "track_updated") {
            const data = payload.data;
            const trackingNumber = data.tracking_number;
            const shippoStatus = data.tracking_status?.status;

            if (trackingNumber && shippoStatus) {
                const newStatus = mapShippoStatusToPrisma(shippoStatus);

                // Find the associated order
                const orderDelegate = (prisma as unknown as {
                    order: {
                        findFirst: (args: { where: { tracking_number: string } }) => Promise<{
                            id: string;
                            shipping_status: string;
                            shipped_at: Date | null;
                            delivered_at: Date | null;
                        } | null>;
                        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
                    };
                }).order;

                const existingOrder = await orderDelegate.findFirst({
                    where: { tracking_number: trackingNumber },
                });

                if (existingOrder && existingOrder.shipping_status !== newStatus) {
                    await orderDelegate.update({
                        where: { id: existingOrder.id },
                        data: {
                            shipping_status: newStatus,
                            ...(newStatus === "SHIPPED" && !existingOrder.shipped_at ? { shipped_at: new Date() } : {}),
                            ...(newStatus === "DELIVERED" && !existingOrder.delivered_at
                                ? {
                                    delivered_at: new Date(),
                                    hold_until: getHoldUntilDate(new Date()),
                                    order_status: "FULFILLED",
                                    seller_transfer_status: "PENDING_HOLD",
                                }
                                : {}),
                        }
                    });

                    // Instantly invalidate the UI cache for buyers and admins
                    revalidatePath("/dashboard/purchases");
                    revalidatePath("/dashboard/sales");
                    revalidatePath("/admin/orders");
                }
            }
        }

        return NextResponse.json({ received: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown webhook error";
        console.error("Shippo Webhook Error:", message);
        return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
    }
}
