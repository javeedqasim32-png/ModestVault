"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { createPromotionCode, deactivatePromotionCode } from "@/app/actions/promotion-codes";

type PromoCode = {
    id: string;
    code: string;
    discount_percent: number;
    absorber: string;
    applies_to_listing_id: string | null;
    applies_to_buyer_id: string | null;
    max_redemptions: number | null;
    redemption_count: number;
    starts_at: string;
    expires_at: string | null;
    active: boolean;
    notes: string | null;
    created_at: string;
};

type CreateModalState = {
    code: string;
    discountPercent: string;
    appliesToListingId: string;
    appliesToBuyerId: string;
    maxRedemptions: string;
    expiresAt: string;
    notes: string;
    submitting: boolean;
    error: string | null;
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminPromoCodesClient({ initialCodes }: { initialCodes: PromoCode[] }) {
    const [codes, setCodes] = useState<PromoCode[]>(initialCodes);
    const [createModal, setCreateModal] = useState<CreateModalState | null>(null);
    const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    function openCreate() {
        setCreateModal({
            code: "",
            discountPercent: "15",
            appliesToListingId: "",
            appliesToBuyerId: "",
            maxRedemptions: "",
            expiresAt: "",
            notes: "",
            submitting: false,
            error: null,
        });
    }

    async function submitCreate() {
        if (!createModal) return;
        const code = createModal.code.trim();
        if (code.length === 0) {
            setCreateModal({ ...createModal, error: "Code is required." });
            return;
        }
        const pct = Number(createModal.discountPercent);
        if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
            setCreateModal({ ...createModal, error: "Discount percent must be an integer between 1 and 100." });
            return;
        }
        const max = createModal.maxRedemptions.trim().length > 0
            ? Number(createModal.maxRedemptions)
            : null;
        if (max !== null && (!Number.isInteger(max) || max < 1)) {
            setCreateModal({ ...createModal, error: "Max redemptions must be a positive integer or empty." });
            return;
        }

        setCreateModal({ ...createModal, submitting: true, error: null });
        try {
            const res = await createPromotionCode({
                code,
                discountPercent: pct,
                absorber: "MODAIRE",
                appliesToListingId: createModal.appliesToListingId.trim() || null,
                appliesToBuyerId: createModal.appliesToBuyerId.trim() || null,
                maxRedemptions: max,
                expiresAt: createModal.expiresAt ? new Date(createModal.expiresAt) : null,
                notes: createModal.notes.trim() || null,
            });
            if ("error" in res) {
                setCreateModal({ ...createModal, submitting: false, error: res.error });
                return;
            }
            // Optimistically inject a stub row; the next page reload / router
            // refresh will replace it with the canonical server-side row.
            const nowIso = new Date().toISOString();
            setCodes((prev) => [
                {
                    id: res.id,
                    code: code.toUpperCase(),
                    discount_percent: pct,
                    absorber: "MODAIRE",
                    applies_to_listing_id: createModal.appliesToListingId.trim() || null,
                    applies_to_buyer_id: createModal.appliesToBuyerId.trim() || null,
                    max_redemptions: max,
                    redemption_count: 0,
                    starts_at: nowIso,
                    expires_at: createModal.expiresAt ? new Date(createModal.expiresAt).toISOString() : null,
                    active: true,
                    notes: createModal.notes.trim() || null,
                    created_at: nowIso,
                },
                ...prev,
            ]);
            setCreateModal(null);
        } catch (err) {
            setCreateModal({
                ...createModal,
                submitting: false,
                error: err instanceof Error ? err.message : "Failed to create code.",
            });
        }
    }

    function handleDeactivate(id: string) {
        setDeactivatingId(id);
        startTransition(async () => {
            const res = await deactivatePromotionCode(id);
            if ("success" in res) {
                setCodes((prev) => prev.map((c) => c.id === id ? { ...c, active: false } : c));
            }
            setDeactivatingId(null);
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button onClick={openCreate}>+ New Promo Code</Button>
            </div>

            {codes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
                    No promo codes yet.
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Code</th>
                                    <th className="px-4 py-3 font-medium">Discount</th>
                                    <th className="px-4 py-3 font-medium">Targeting</th>
                                    <th className="px-4 py-3 font-medium">Redemptions</th>
                                    <th className="px-4 py-3 font-medium">Expires</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {codes.map((c) => (
                                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="font-mono font-semibold text-foreground">{c.code}</div>
                                            {c.notes ? <div className="text-xs text-muted-foreground line-clamp-1">{c.notes}</div> : null}
                                        </td>
                                        <td className="px-4 py-3 text-foreground">{c.discount_percent}%</td>
                                        <td className="px-4 py-3 text-xs">
                                            {c.applies_to_listing_id ? (
                                                <div>Listing: <span className="font-mono">{c.applies_to_listing_id.slice(0, 8)}…</span></div>
                                            ) : null}
                                            {c.applies_to_buyer_id ? (
                                                <div>Buyer: <span className="font-mono">{c.applies_to_buyer_id.slice(0, 8)}…</span></div>
                                            ) : null}
                                            {!c.applies_to_listing_id && !c.applies_to_buyer_id ? (
                                                <span className="text-muted-foreground">Any listing · any buyer</span>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 text-foreground">
                                            {c.redemption_count}
                                            {c.max_redemptions !== null ? ` / ${c.max_redemptions}` : ""}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs">
                                            {c.expires_at ? formatDate(c.expires_at) : "Never"}
                                        </td>
                                        <td className="px-4 py-3">
                                            {c.active ? (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Active</span>
                                            ) : (
                                                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-700">Inactive</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {c.active ? (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleDeactivate(c.id)}
                                                    disabled={deactivatingId === c.id}
                                                >
                                                    {deactivatingId === c.id ? "..." : "Deactivate"}
                                                </Button>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {createModal ? (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 py-4">
                    <div className="mx-auto mb-32 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:mb-8">
                        <h2 className="text-lg font-bold text-foreground">New Promo Code</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Modaire absorbs the discount from its 15% platform fee. Seller is unaffected.
                        </p>

                        <div className="mt-4 space-y-3">
                            <label className="block text-sm font-medium text-foreground">
                                Code
                                <input
                                    type="text"
                                    value={createModal.code}
                                    onChange={(e) => setCreateModal({ ...createModal, code: e.target.value, error: null })}
                                    disabled={createModal.submitting}
                                    autoCapitalize="characters"
                                    placeholder="e.g. MODAIRE15"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono uppercase"
                                />
                            </label>

                            <label className="block text-sm font-medium text-foreground">
                                Discount percent
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={createModal.discountPercent}
                                    onChange={(e) => setCreateModal({ ...createModal, discountPercent: e.target.value, error: null })}
                                    disabled={createModal.submitting}
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                />
                            </label>

                            <label className="block text-sm font-medium text-foreground">
                                Applies to listing id <span className="text-muted-foreground">(optional)</span>
                                <input
                                    type="text"
                                    value={createModal.appliesToListingId}
                                    onChange={(e) => setCreateModal({ ...createModal, appliesToListingId: e.target.value, error: null })}
                                    disabled={createModal.submitting}
                                    placeholder="Blank = any listing"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                                />
                            </label>

                            <label className="block text-sm font-medium text-foreground">
                                Applies to buyer id <span className="text-muted-foreground">(optional)</span>
                                <input
                                    type="text"
                                    value={createModal.appliesToBuyerId}
                                    onChange={(e) => setCreateModal({ ...createModal, appliesToBuyerId: e.target.value, error: null })}
                                    disabled={createModal.submitting}
                                    placeholder="Blank = any buyer"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                                />
                            </label>

                            <label className="block text-sm font-medium text-foreground">
                                Max redemptions <span className="text-muted-foreground">(optional; blank = unlimited)</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={createModal.maxRedemptions}
                                    onChange={(e) => setCreateModal({ ...createModal, maxRedemptions: e.target.value, error: null })}
                                    disabled={createModal.submitting}
                                    placeholder="1"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                />
                            </label>

                            <label className="block text-sm font-medium text-foreground">
                                Expires <span className="text-muted-foreground">(optional)</span>
                                <input
                                    type="datetime-local"
                                    value={createModal.expiresAt}
                                    onChange={(e) => setCreateModal({ ...createModal, expiresAt: e.target.value, error: null })}
                                    disabled={createModal.submitting}
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                />
                            </label>

                            <label className="block text-sm font-medium text-foreground">
                                Notes <span className="text-muted-foreground">(admin-only)</span>
                                <textarea
                                    value={createModal.notes}
                                    onChange={(e) => setCreateModal({ ...createModal, notes: e.target.value, error: null })}
                                    disabled={createModal.submitting}
                                    rows={2}
                                    placeholder="Why was this code created?"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                />
                            </label>

                        </div>

                        {createModal.error ? (
                            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {createModal.error}
                            </div>
                        ) : null}

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setCreateModal(null)} disabled={createModal.submitting}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={submitCreate} disabled={createModal.submitting}>
                                {createModal.submitting ? "Creating..." : "Create Code"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
