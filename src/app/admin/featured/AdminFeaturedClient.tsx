"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUp, ArrowDown, X, Star } from "lucide-react";
import { setFeaturedListingsOrder } from "@/app/actions/admin";

type FeaturedItem = {
    id: string;
    title: string;
    price: number;
    image_url: string;
    seller_name: string;
};

const HOME_RAIL_SIZE = 8;

export default function AdminFeaturedClient({ initialItems }: { initialItems: FeaturedItem[] }) {
    const [items, setItems] = useState<FeaturedItem[]>(initialItems);
    const [pending, startTransition] = useTransition();
    const [saveMessage, setSaveMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

    // Track whether the local order differs from the last-persisted order so
    // the Save button can disable when there's nothing to save.
    const [savedIds, setSavedIds] = useState<string[]>(() => initialItems.map((i) => i.id));
    const isDirty =
        items.length !== savedIds.length ||
        items.some((item, index) => item.id !== savedIds[index]);

    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= items.length) return;
        setItems((prev) => {
            const next = [...prev];
            const [moved] = next.splice(index, 1);
            next.splice(target, 0, moved);
            return next;
        });
    };

    const remove = (index: number) => {
        setItems((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        setSaveMessage(null);
        startTransition(async () => {
            try {
                const orderedIds = items.map((i) => i.id);
                const res = await setFeaturedListingsOrder(orderedIds);
                if (res?.success) {
                    setSavedIds(orderedIds);
                    setSaveMessage({ kind: "ok", text: "Saved. Home rail is updated." });
                } else {
                    setSaveMessage({ kind: "err", text: "Save failed. Please try again." });
                }
            } catch (err) {
                console.error("Save featured order failed:", err);
                setSaveMessage({
                    kind: "err",
                    text: err instanceof Error ? err.message : "Save failed. Please try again.",
                });
            }
        });
    };

    return (
        <div>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                    <h1 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">Featured Listings</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The top {HOME_RAIL_SIZE} below appear on the Home page Featured rail, in this order.
                        Use the arrows to reorder, or remove from the rail.
                    </p>
                </div>
                <div className="flex items-center justify-end gap-3">
                    {saveMessage ? (
                        <span
                            className={`text-sm ${saveMessage.kind === "ok" ? "text-green-700" : "text-red-700"}`}
                        >
                            {saveMessage.text}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!isDirty || pending}
                        className="rounded-full bg-[#7a5a45] px-5 py-2 text-sm font-medium text-white hover:bg-[#684a38] disabled:bg-[#7a5a45]/40 disabled:cursor-not-allowed"
                    >
                        {pending ? "Saving…" : "Save order"}
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                    <Star className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                    <p className="mt-3 text-sm text-muted-foreground">
                        No featured listings yet. Use{" "}
                        <Link href="/admin/listings" className="text-primary underline">
                            Listings
                        </Link>{" "}
                        to feature some.
                    </p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {items.map((item, index) => {
                        const onHomeRail = index < HOME_RAIL_SIZE;
                        return (
                            <li
                                key={item.id}
                                className={`flex items-center gap-4 rounded-2xl border bg-card p-3 ${
                                    onHomeRail ? "border-border" : "border-dashed border-border/60 opacity-70"
                                }`}
                            >
                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3eae3] text-sm font-semibold text-[#5f4437]">
                                    {index + 1}
                                </span>

                                <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-[#f2ebe4]">
                                    {item.image_url ? (
                                        <Image src={item.image_url} alt={item.title} fill className="object-cover" sizes="48px" />
                                    ) : null}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/listings/${item.id}`}
                                        className="block truncate text-sm font-medium text-foreground hover:underline"
                                    >
                                        {item.title}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {item.seller_name} · ${item.price.toLocaleString()}
                                    </p>
                                    {!onHomeRail ? (
                                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-amber-700">
                                            Below top {HOME_RAIL_SIZE} — not visible on Home
                                        </p>
                                    ) : null}
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => move(index, -1)}
                                        disabled={index === 0}
                                        title="Move up"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => move(index, 1)}
                                        disabled={index === items.length - 1}
                                        title="Move down"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => remove(index)}
                                        title="Remove from featured"
                                        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
