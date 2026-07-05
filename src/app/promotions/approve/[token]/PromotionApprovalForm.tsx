"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { submitPromotionApproval } from "@/app/actions/promotions";

type Item = {
    listingPromotionId: string;
    listingId: string;
    title: string;
    image: string | null;
    originalPrice: number;
    discountedPrice: number;
    initiallyAccepted: boolean;
    currentStatus: string;
    available: boolean;
};

/**
 * Interactive checkbox list of the seller's eligible listings. Local state
 * tracks which are selected; on submit we POST the id list to the server
 * action which owner-scopes writes. Optimistic-friendly: the button
 * disables during the transition, but nothing is mutated locally until
 * the server confirms.
 */
export default function PromotionApprovalForm({
    token,
    campaignName,
    discountPercent,
    items,
    sellerName,
}: {
    token: string;
    campaignName: string;
    discountPercent: number;
    items: Item[];
    sellerName: string;
}) {
    const [selected, setSelected] = useState<Set<string>>(
        () => new Set(items.filter((i) => i.initiallyAccepted && i.available).map((i) => i.listingId)),
    );
    const [pending, startTransition] = useTransition();
    const [feedback, setFeedback] = useState<
        | { kind: "success"; acceptedCount: number; declinedCount: number }
        | { kind: "error"; message: string }
        | null
    >(null);

    function toggle(listingId: string) {
        setFeedback(null);
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(listingId)) next.delete(listingId);
            else next.add(listingId);
            return next;
        });
    }

    function submit() {
        setFeedback(null);
        startTransition(async () => {
            const res = await submitPromotionApproval({
                token,
                listingIds: Array.from(selected),
            });
            if ("error" in res) {
                setFeedback({ kind: "error", message: res.error });
            } else {
                setFeedback({
                    kind: "success",
                    acceptedCount: res.acceptedCount,
                    declinedCount: res.declinedCount,
                });
            }
        });
    }

    const selectableCount = items.filter((i) => i.available).length;
    const allSelected = selected.size === selectableCount && selectableCount > 0;

    return (
        <div>
            <div className="mb-4 flex items-center justify-between text-[13px] text-[#6f6054]">
                <span>
                    <strong className="text-[#2f2925]">{selected.size}</strong> of {selectableCount} selected
                </span>
                <button
                    type="button"
                    onClick={() => {
                        setFeedback(null);
                        setSelected(
                            allSelected
                                ? new Set()
                                : new Set(items.filter((i) => i.available).map((i) => i.listingId)),
                        );
                    }}
                    className="text-[12px] font-medium text-[#a07c61] underline-offset-2 hover:underline"
                >
                    {allSelected ? "Deselect all" : "Select all"}
                </button>
            </div>

            <ul className="space-y-3">
                {items.map((item) => {
                    const isSelected = selected.has(item.listingId);
                    const disabled = !item.available;
                    return (
                        <li key={item.listingPromotionId}>
                            <label
                                className={`flex cursor-pointer items-center gap-4 rounded-[14px] border px-4 py-3 transition ${
                                    disabled
                                        ? "cursor-not-allowed border-[#e3d9d1] bg-[#f7f2ed] opacity-60"
                                        : isSelected
                                        ? "border-[#a07c61] bg-[#fbf5f0]"
                                        : "border-[#e3d9d1] bg-white hover:border-[#c9b6a4]"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={disabled}
                                    onChange={() => toggle(item.listingId)}
                                    className="h-5 w-5 accent-[#a07c61]"
                                />
                                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-[#f2ebe4]">
                                    {item.image ? (
                                        <Image
                                            src={item.image}
                                            alt={item.title}
                                            width={64}
                                            height={64}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : null}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-medium text-[#2f2925]">
                                        {item.title}
                                    </p>
                                    <p className="mt-0.5 flex items-baseline gap-2 text-[13px]">
                                        <span className="font-semibold text-[#4a3328]">
                                            ${item.discountedPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[#8a7667] line-through">
                                            ${item.originalPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[11px] uppercase tracking-[0.15em] text-[#8a7667]">
                                            {discountPercent}% off
                                        </span>
                                    </p>
                                    {disabled ? (
                                        <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-[#c48a54]">
                                            Not available — sold or removed
                                        </p>
                                    ) : null}
                                </div>
                            </label>
                        </li>
                    );
                })}
            </ul>

            <div className="mt-6 flex items-center justify-between gap-4 rounded-[14px] border border-[#e3d9d1] bg-white px-5 py-4">
                <p className="text-[12px] text-[#6f6054]">
                    {sellerName ? `${sellerName} · ` : ""}
                    {campaignName}
                </p>
                <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className={`rounded-full px-6 py-2.5 text-[14px] font-semibold text-white transition ${
                        pending ? "bg-[#c9b6a4]" : "bg-[#a07c61] hover:bg-[#8f6d54]"
                    }`}
                >
                    {pending ? "Saving..." : `Save (${selected.size} selected)`}
                </button>
            </div>

            {feedback && feedback.kind === "success" ? (
                <div className="mt-4 rounded-[12px] border border-[#c9d8b6] bg-[#f4f9ec] px-4 py-3 text-[13px] text-[#3a5326]">
                    Saved. {feedback.acceptedCount ? `${feedback.acceptedCount} newly opted in.` : ""}
                    {feedback.declinedCount ? ` ${feedback.declinedCount} removed.` : ""}
                </div>
            ) : null}
            {feedback && feedback.kind === "error" ? (
                <div className="mt-4 rounded-[12px] border border-[#e6c6b8] bg-[#fbeadd] px-4 py-3 text-[13px] text-[#8f4a2a]">
                    {feedback.message}
                </div>
            ) : null}
        </div>
    );
}
