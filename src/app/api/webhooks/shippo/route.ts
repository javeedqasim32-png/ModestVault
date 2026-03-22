import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
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

export async function POST(req: Request) {
    try {
        const bodyText = await req.text();
        const headersList = await headers();

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
                const existingOrder = await (prisma as any).order.findFirst({
                    where: { tracking_number: trackingNumber },
                });

                if (existingOrder && existingOrder.shipping_status !== newStatus) {
                    await (prisma as any).order.update({
                        where: { id: existingOrder.id },
                        data: {
                            shipping_status: newStatus,
                            ...(newStatus === "SHIPPED" && !existingOrder.shipped_at ? { shipped_at: new Date() } : {}),
                            ...(newStatus === "DELIVERED" && !existingOrder.delivered_at ? { delivered_at: new Date() } : {}),
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
    } catch (err: any) {
        console.error("Shippo Webhook Error:", err.message);
        return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }
}
