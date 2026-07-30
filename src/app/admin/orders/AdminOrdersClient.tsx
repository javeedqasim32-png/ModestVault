"use client";

import { useState } from "react";
import { updateOrderShipping, refundOrder, refundOrderLabelOnly } from "@/app/actions/admin";
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
    // Shipping charged to buyer; 0 for legacy orders and for bundle-child
    // orders where the parent absorbs the full shipping cost.
    shipping_amount: number;
    // Non-refundable Processing & Handling fee (cents). 0 on orders created
    // before the fee was introduced — those refund as full item + shipping.
    processing_fee_cents: number;
    // Buyer-facing promo code state. Null on orders that didn't use one.
    // Discount is absolute cents; refund logic doesn't touch these — buyer
    // is refunded what they actually paid (item + shipping) regardless.
    promotion_code_id: string | null;
    promotion_discount_cents: number;
    created_at: string;
    buyer_name: string;
    buyer_email: string;
    seller_name: string;
    seller_email: string;
    listing_title: string;
    listing_image: string;
    shippo_transaction_id: string | null;
    shippo_label_refund_id: string | null;
    shippo_label_refund_status: string | null;
};

type RefundModalState = {
    order: AdminOrder;
    reason: ModaireRefundReason;
    note: string;
    error: string | null;
    submitting: boolean;
};

type LabelRefundModalState = {
    order: AdminOrder;
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
    const [labelRefundModal, setLabelRefundModal] = useState<LabelRefundModalState | null>(null);

    function openLabelRefundModal(order: AdminOrder) {
        setLabelRefundModal({ order, note: "", error: null, submitting: false });
    }

    async function submitLabelRefundModal() {
        if (!labelRefundModal) return;
        setLabelRefundModal({ ...labelRefundModal, submitting: true, error: null });
        try {
            const res = await refundOrderLabelOnly(labelRefundModal.order.id, {
                note: labelRefundModal.note || undefined,
            });
            if ("error" in res) {
                setLabelRefundModal({ ...labelRefundModal, submitting: false, error: res.error ?? "Unknown error." });
                return;
            }
            // Reflect the queued refund state in the local row so the button
            // vanishes and the badge appears without a page refresh.
            setOrders(prev => prev.map(o => o.id === labelRefundModal.order.id
                ? { ...o, shippo_label_refund_id: res.refundId, shippo_label_refund_status: res.status }
                : o
            ));
            setLabelRefundModal(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error.";
            setLabelRefundModal({ ...labelRefundModal, submitting: false, error: message });
        }
    }

    // Eligibility for the "Refund label only" action mirrors the server-side
    // guards in refundOrderLabelOnly (src/app/actions/admin.ts). Kept in sync
    // manually — if either changes the other should too.
    function isLabelRefundEligible(order: AdminOrder): boolean {
        if (!order.shippo_transaction_id) return false;
        if (order.shippo_label_refund_id) return false;
        if (["SHIPPED", "DELIVERED", "RETURNED"].includes(order.shipping_status)) return false;
        return true;
    }

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
                                                {isLabelRefundEligible(order) ? (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => openLabelRefundModal(order)}
                                                    >
                                                        Refund label only
                                                    </Button>
                                                ) : order.shippo_label_refund_status ? (
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] ${
                                                            order.shippo_label_refund_status === "SUCCESS"
                                                                ? "bg-emerald-50 text-emerald-800"
                                                                : order.shippo_label_refund_status === "DECLINED" || order.shippo_label_refund_status === "ERROR"
                                                                    ? "bg-red-50 text-red-800"
                                                                    : "bg-amber-50 text-amber-800"
                                                        }`}
                                                        title="Label refund status (updated by Shippo webhook)"
                                                    >
                                                        Label: {order.shippo_label_refund_status}
                                                    </span>
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
                            const refundAmount = refundModal.order.amount + refundModal.order.shipping_amount;
                            const feeAmount = (refundModal.order.processing_fee_cents ?? 0) / 100;
                            return (
                                <>
                                    <h2 className="text-lg font-bold text-foreground">Refund Order</h2>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {isPreShipment
                                            ? `"${refundModal.order.listing_title}" hasn't shipped yet, so the order will be marked CANCELLED and the listing will be put back up for sale. Buyer gets $${refundAmount.toFixed(2)} back (item + shipping).`
                                            : `"${refundModal.order.listing_title}" has already shipped, so the order will be marked REFUNDED. Buyer gets $${refundAmount.toFixed(2)} back (item + shipping). If the seller was already paid, we'll pull the funds back from their connected account.`}
                                    </p>
                                    {feeAmount > 0 ? (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            Processing fee ${feeAmount.toFixed(2)} is non-refundable — Stripe keeps it.
                                        </p>
                                    ) : null}
                                    {refundModal.order.promotion_code_id && refundModal.order.promotion_discount_cents > 0 ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Promo code applied at checkout (&minus;${(refundModal.order.promotion_discount_cents / 100).toFixed(2)}).
                                            Seller was paid based on the ORIGINAL listing price; Modaire absorbs the discount on refund.
                                        </p>
                                    ) : null}
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

            {labelRefundModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <h2 className="text-lg font-bold text-foreground">Refund shipping label</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Refund the shipping label for &ldquo;{labelRefundModal.order.listing_title}&rdquo;?
                            The buyer&rsquo;s payment and the seller&rsquo;s earnings are unaffected — this only
                            refunds the label cost from Shippo back to Modaire&rsquo;s balance.
                        </p>
                        <label className="mt-4 block text-sm font-medium text-foreground">
                            Note <span className="text-muted-foreground">(optional — internal audit)</span>
                            <textarea
                                value={labelRefundModal.note}
                                onChange={(e) => setLabelRefundModal({ ...labelRefundModal, note: e.target.value, error: null })}
                                disabled={labelRefundModal.submitting}
                                rows={3}
                                placeholder="e.g., Seller printed a duplicate label; original went unused."
                                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            />
                        </label>
                        {labelRefundModal.error ? (
                            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {labelRefundModal.error}
                            </div>
                        ) : null}
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setLabelRefundModal(null)}
                                disabled={labelRefundModal.submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={submitLabelRefundModal}
                                disabled={labelRefundModal.submitting}
                            >
                                {labelRefundModal.submitting ? "Refunding…" : "Refund label"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
