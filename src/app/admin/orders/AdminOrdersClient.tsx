"use client";

import { useState } from "react";
import { updateOrderShipping, refundOrder } from "@/app/actions/admin";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
    DEFAULT_MODAIRE_REFUND_REASON,
    MODAIRE_REFUND_REASONS,
    refundReasonRequiresNote,
    type ModaireRefundReason,
} from "@/lib/refund-reasons";

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

type RefundModalState = {
    order: AdminOrder;
    reason: ModaireRefundReason;
    note: string;
    error: string | null;
    submitting: boolean;
};

const SHIPPING_STATUSES = [
    "NOT_SHIPPED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "RETURNED"
];

const TERMINAL_ORDER_STATUSES = new Set(["REFUNDED", "CANCELLED"]);
const PRE_SHIPMENT_STATUSES = new Set(["NOT_SHIPPED", "PROCESSING"]);

export default function AdminOrdersClient({ initialOrders }: { initialOrders: AdminOrder[] }) {
    const [orders, setOrders] = useState<AdminOrder[]>(initialOrders);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        shippingStatus: "",
        carrier: "",
        trackingNumber: ""
    });
    const [processing, setProcessing] = useState(false);
    const [refundModal, setRefundModal] = useState<RefundModalState | null>(null);

    function openRefundModal(order: AdminOrder) {
        setRefundModal({
            order,
            reason: DEFAULT_MODAIRE_REFUND_REASON,
            note: "",
            error: null,
            submitting: false,
        });
    }

    async function submitRefundModal() {
        if (!refundModal) return;
        // Client-side guard so the admin can't submit "Other" without context.
        // The server enforces this too as defense-in-depth.
        if (refundReasonRequiresNote(refundModal.reason) && refundModal.note.trim().length === 0) {
            setRefundModal({
                ...refundModal,
                error: "Please add a note explaining the reason when selecting 'Other'.",
            });
            return;
        }
        setRefundModal({ ...refundModal, submitting: true, error: null });
        try {
            const res = await refundOrder(refundModal.order.id, {
                reason: refundModal.reason,
                note: refundModal.note || undefined,
            });
            if ("error" in res) {
                setRefundModal({ ...refundModal, submitting: false, error: res.error ?? "Unknown error." });
                return;
            }
            const nextStatus = res.orderStatus; // "CANCELLED" or "REFUNDED"
            setOrders(prev => prev.map(o => o.id === refundModal.order.id ? { ...o, order_status: nextStatus } : o));
            setRefundModal(null);
            if (res.reversalError) {
                // eslint-disable-next-line no-alert
                alert(`Refund processed, BUT the seller transfer reversal failed: ${res.reversalError}\n\nManually reconcile this with the seller.`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error.";
            setRefundModal({ ...refundModal, submitting: false, error: message });
        }
    }

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
                                            <div className="flex flex-col gap-2 items-end">
                                                <Button size="sm" variant="outline" onClick={() => startEditing(order)}>
                                                    Edit Status
                                                </Button>
                                                {!TERMINAL_ORDER_STATUSES.has(order.order_status) ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => openRefundModal(order)}
                                                    >
                                                        Refund Order
                                                    </Button>
                                                ) : null}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {refundModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        {(() => {
                            const isPreShipment = PRE_SHIPMENT_STATUSES.has(refundModal.order.shipping_status);
                            return (
                                <>
                                    <h2 className="text-lg font-bold text-foreground">Refund Order</h2>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {isPreShipment
                                            ? `"${refundModal.order.listing_title}" hasn't shipped yet, so the order will be marked CANCELLED and the listing will be put back up for sale. Buyer gets $${refundModal.order.amount.toFixed(2)} back.`
                                            : `"${refundModal.order.listing_title}" has already shipped, so the order will be marked REFUNDED. Buyer gets $${refundModal.order.amount.toFixed(2)} back. If the seller was already paid, we'll pull the funds back from their connected account.`}
                                    </p>
                                </>
                            );
                        })()}

                        <label className="mt-4 block text-sm font-medium text-foreground">
                            Reason
                            <select
                                value={refundModal.reason}
                                onChange={(e) => setRefundModal({
                                    ...refundModal,
                                    reason: e.target.value as ModaireRefundReason,
                                    // Clear stale validation when the admin changes the reason
                                    // so the error message doesn't linger.
                                    error: null,
                                })}
                                disabled={refundModal.submitting}
                                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            >
                                {MODAIRE_REFUND_REASONS.map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </label>

                        {(() => {
                            const noteRequired = refundReasonRequiresNote(refundModal.reason);
                            return (
                                <label className="mt-3 block text-sm font-medium text-foreground">
                                    Note {noteRequired
                                        ? <span className="text-red-600">(required)</span>
                                        : <span className="text-muted-foreground">(optional — shown in both emails)</span>}
                                    <textarea
                                        value={refundModal.note}
                                        onChange={(e) => setRefundModal({ ...refundModal, note: e.target.value, error: null })}
                                        disabled={refundModal.submitting}
                                        rows={3}
                                        placeholder={noteRequired
                                            ? "Required when reason is 'Other'. Briefly describe what happened."
                                            : "e.g., Buyer reported the item arrived damaged."}
                                        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                        aria-required={noteRequired}
                                    />
                                </label>
                            );
                        })()}

                        {refundModal.error ? (
                            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {refundModal.error}
                            </div>
                        ) : null}

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRefundModal(null)}
                                disabled={refundModal.submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={submitRefundModal}
                                disabled={
                                    refundModal.submitting ||
                                    (refundReasonRequiresNote(refundModal.reason) &&
                                        refundModal.note.trim().length === 0)
                                }
                            >
                                {refundModal.submitting ? "Processing…" : "Issue Refund"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
