"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { hideSiteReview, unhideSiteReview } from "@/app/actions/site-reviews";

type AdminReview = {
    id: string;
    rating: number;
    body: string | null;
    status: string;              // PUBLISHED | HIDDEN
    hidden_at: string | null;
    hidden_reason: string | null;
    created_at: string;
    reviewer_name: string;
    reviewer_email: string;
};

type HideModalState = {
    review: AdminReview;
    reason: string;
    submitting: boolean;
    error: string | null;
};

function StarRow({ rating }: { rating: number }) {
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    className={`h-3.5 w-3.5 ${
                        n <= rating ? "fill-[#c8a978] text-[#c8a978]" : "text-[#e2d7cd]"
                    }`}
                />
            ))}
        </div>
    );
}

export default function AdminReviewsClient({ initialReviews }: { initialReviews: AdminReview[] }) {
    const [reviews, setReviews] = useState<AdminReview[]>(initialReviews);
    const [hideModal, setHideModal] = useState<HideModalState | null>(null);
    const [, startTransition] = useTransition();
    const [tab, setTab] = useState<"PUBLISHED" | "HIDDEN">("PUBLISHED");

    const visible = reviews.filter((r) => r.status === tab);

    function submitHide() {
        if (!hideModal) return;
        setHideModal({ ...hideModal, submitting: true, error: null });
        startTransition(async () => {
            const res = await hideSiteReview(hideModal.review.id, hideModal.reason);
            if ("error" in res) {
                setHideModal({ ...hideModal, submitting: false, error: res.error });
                return;
            }
            setReviews((prev) =>
                prev.map((r) =>
                    r.id === hideModal.review.id
                        ? { ...r, status: "HIDDEN", hidden_reason: hideModal.reason.trim() || null }
                        : r,
                ),
            );
            setHideModal(null);
        });
    }

    function handleUnhide(id: string) {
        startTransition(async () => {
            const res = await unhideSiteReview(id);
            if ("success" in res) {
                setReviews((prev) =>
                    prev.map((r) =>
                        r.id === id
                            ? { ...r, status: "PUBLISHED", hidden_at: null, hidden_reason: null }
                            : r,
                    ),
                );
            }
        });
    }

    return (
        <div className="space-y-6">
            {/* Status tab strip — mirror the AdminListingsClient pattern
                so admin muscle memory works across pages. */}
            <div className="flex flex-wrap gap-1 rounded-lg border border-border/80 bg-card/60 p-1 sm:w-max sm:flex-nowrap sm:gap-2">
                {(["PUBLISHED", "HIDDEN"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors sm:px-6 sm:py-2 sm:text-sm ${
                            tab === t
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {t} ({reviews.filter((r) => r.status === t).length})
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
                    No {tab.toLowerCase()} reviews.
                </div>
            ) : (
                <ul className="divide-y divide-border/60 rounded-2xl border border-border/80 bg-card">
                    {visible.map((r) => (
                        <li key={r.id} className="px-4 py-4 sm:px-6 sm:py-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3">
                                        <StarRow rating={r.rating} />
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(r.created_at).toLocaleDateString(undefined, {
                                                year: "numeric",
                                                month: "short",
                                                day: "numeric",
                                            })}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm font-semibold text-foreground">
                                        {r.reviewer_name}
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                            {r.reviewer_email}
                                        </span>
                                    </p>
                                    {r.body ? (
                                        <p className="mt-2 text-sm text-muted-foreground">{r.body}</p>
                                    ) : (
                                        <p className="mt-2 text-xs italic text-muted-foreground">
                                            (Rating only, no text)
                                        </p>
                                    )}
                                    {r.status === "HIDDEN" && r.hidden_reason ? (
                                        <p className="mt-2 text-xs text-amber-700">
                                            Hidden: {r.hidden_reason}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="shrink-0">
                                    {r.status === "PUBLISHED" ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                setHideModal({
                                                    review: r,
                                                    reason: "",
                                                    submitting: false,
                                                    error: null,
                                                })
                                            }
                                        >
                                            Hide
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleUnhide(r.id)}
                                        >
                                            Unhide
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {hideModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <h2 className="text-lg font-bold text-foreground">Hide review</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            The review will no longer appear on /reviews or feed into the aggregate rating. You can unhide it later.
                        </p>
                        <label className="mt-4 block text-sm font-medium text-foreground">
                            Reason <span className="text-muted-foreground">(admin-only note)</span>
                            <textarea
                                value={hideModal.reason}
                                onChange={(e) =>
                                    setHideModal({ ...hideModal, reason: e.target.value, error: null })
                                }
                                disabled={hideModal.submitting}
                                rows={2}
                                placeholder="e.g., spam / abusive / unrelated"
                                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            />
                        </label>
                        {hideModal.error ? (
                            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {hideModal.error}
                            </div>
                        ) : null}
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setHideModal(null)}
                                disabled={hideModal.submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={submitHide}
                                disabled={hideModal.submitting}
                            >
                                {hideModal.submitting ? "Hiding..." : "Hide review"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
