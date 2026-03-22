"use client";

import { useState } from "react";
import { updateOrderShipping } from "@/app/actions/admin";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type AdminOrder = {
    id: string;
    purchase_id: string;
    order_status: string;
    shipping_status: string;
    carrier: string | null;
    tracking_number: string | null;
    amount: number;
    created_at: string;
    buyer_name: string;
    buyer_email: string;
    seller_name: string;
    seller_email: string;
    listing_title: string;
    listing_image: string;
};

const SHIPPING_STATUSES = [
    "NOT_SHIPPED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "RETURNED"
];

export default function AdminOrdersClient({ initialOrders }: { initialOrders: AdminOrder[] }) {
    const [orders, setOrders] = useState<AdminOrder[]>(initialOrders);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        shippingStatus: "",
        carrier: "",
        trackingNumber: ""
    });
    const [processing, setProcessing] = useState(false);

    function startEditing(order: AdminOrder) {
        setEditingId(order.id);
        setEditForm({
            shippingStatus: order.shipping_status,
            carrier: order.carrier || "",
            trackingNumber: order.tracking_number || ""
        });
    }

    async function handleSave() {
        if (!editingId) return;
        setProcessing(true);

        const res = await updateOrderShipping(editingId, {
            shippingStatus: editForm.shippingStatus,
            carrier: editForm.carrier || undefined,
            trackingNumber: editForm.trackingNumber || undefined
        });

        if (res.success) {
            setOrders(prev => prev.map(o => o.id === editingId ? {
                ...o,
                shipping_status: editForm.shippingStatus,
                carrier: editForm.carrier || null,
                tracking_number: editForm.trackingNumber || null
            } : o));
            setEditingId(null);
        }
        setProcessing(false);
    }

    return (
        <div className="bg-card border border-border/80 rounded-[1.25rem] overflow-hidden shadow-sm">
            {orders.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                    No orders have been placed yet.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4 font-medium">Order Details</th>
                                <th className="px-6 py-4 font-medium">Participants</th>
                                <th className="px-6 py-4 font-medium">Status & Tracking</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {orders.map(order => (
                                <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4 min-w-[200px]">
                                            <div className="w-12 h-16 relative rounded-md overflow-hidden bg-muted flex-shrink-0">
                                                <Image src={order.listing_image} alt={order.listing_title} fill className="object-cover" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-foreground line-clamp-2">{order.listing_title}</div>
                                                <div className="font-medium mt-1">${order.amount.toLocaleString()}</div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {new Date(order.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="mb-2">
                                            <span className="text-xs text-muted-foreground block uppercase">Buyer</span>
                                            <div className="font-medium text-foreground">{order.buyer_name}</div>
                                            <div className="text-xs text-muted-foreground">{order.buyer_email}</div>
                                        </div>
                                        <div>
                                            <span className="text-xs text-muted-foreground block uppercase">Seller</span>
                                            <div className="font-medium text-foreground">{order.seller_name}</div>
                                            <div className="text-xs text-muted-foreground">{order.seller_email}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 min-w-[220px]">
                                        {editingId === order.id ? (
                                            <div className="space-y-2">
                                                <select
                                                    value={editForm.shippingStatus}
                                                    onChange={e => setEditForm({ ...editForm, shippingStatus: e.target.value })}
                                                    className="w-full h-8 text-sm border border-border rounded-md px-2 bg-background"
                                                >
                                                    {SHIPPING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="Carrier (e.g. USPS)"
                                                    value={editForm.carrier}
                                                    onChange={e => setEditForm({ ...editForm, carrier: e.target.value })}
                                                    className="w-full h-8 text-sm border border-border rounded-md px-2 bg-background"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Tracking Number"
                                                    value={editForm.trackingNumber}
                                                    onChange={e => setEditForm({ ...editForm, trackingNumber: e.target.value })}
                                                    className="w-full h-8 text-sm border border-border rounded-md px-2 bg-background"
                                                />
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                <div className="mb-2">
                                                    <span className="text-xs text-muted-foreground mr-2">Shipping:</span>
                                                    <Badge variant="outline" className="text-xs uppercase break-words">{order.shipping_status}</Badge>
                                                </div>
                                                <div className="text-sm">
                                                    <span className="text-muted-foreground">Carrier: </span>
                                                    <span className="font-medium">{order.carrier || "—"}</span>
                                                </div>
                                                <div className="text-sm">
                                                    <span className="text-muted-foreground">Tracking: </span>
                                                    <span className="font-medium">{order.tracking_number || "—"}</span>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right align-top">
                                        {editingId === order.id ? (
                                            <div className="flex flex-col gap-2 items-end">
                                                <Button size="sm" onClick={handleSave} disabled={processing}>Save</Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={processing}>Cancel</Button>
                                            </div>
                                        ) : (
                                            <Button size="sm" variant="outline" onClick={() => startEditing(order)}>
                                                Edit Status
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
