import { prisma } from "@/lib/prisma";
import AdminOrdersClient from "./AdminOrdersClient";
import { serializePurchase } from "@/lib/serialization";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
    // Fetch all orders with associated purchase, listing, and buyer/seller details
    const orders = await prisma.order.findMany({
        include: {
            purchase: {
                include: {
                    buyer: {
                        select: {
                            first_name: true,
                            last_name: true,
                            email: true,
                        }
                    },
                    listing: {
                        include: {
                            images: {
                                orderBy: { imageOrder: "asc" },
                                take: 1,
                                select: { imageUrl: true, thumbUrl: true, mediumUrl: true }
                            },
                            user: {
                                select: {
                                    first_name: true,
                                    last_name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            }
        },
        orderBy: { created_at: "desc" }
    });

    const formattedOrders = orders.map(order => {
        const serializedPurchase = serializePurchase(order.purchase);
        return {
            id: order.id,
            purchase_id: order.purchase_id,
            order_status: order.order_status,
            shipping_status: order.shipping_status,
            carrier: order.carrier,
            tracking_number: order.tracking_number,
            amount: serializedPurchase?.amount ?? 0,
            created_at: order.created_at.toISOString(),
            buyer_name: `${order.purchase.buyer.first_name} ${order.purchase.buyer.last_name}`,
            buyer_email: order.purchase.buyer.email,
            seller_name: `${order.purchase.listing.user.first_name} ${order.purchase.listing.user.last_name}`,
            seller_email: order.purchase.listing.user.email,
            listing_title: order.purchase.listing.title,
            listing_image: order.purchase.listing.images[0]?.mediumUrl || order.purchase.listing.images[0]?.imageUrl || "/placeholder.svg",
        };
    });

    return (
        <div className="mt-4">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-8">Order & Shipping Management</h1>
            <AdminOrdersClient initialOrders={formattedOrders} />
        </div>
    );
}
