"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronRight, ShieldCheck, Trash2 } from "lucide-react";
import { createCheckoutForSellerGroup } from "@/app/actions/checkout";
import { removeCartItem } from "@/app/actions/cart";

export type SellerCartItem = {
    id: string;          // CartItem id (used by removeCartItem)
    listing: {
        id: string;
        title: string;
        price: number;            // Original listing price
        effectivePrice: number;   // What the buyer will actually pay (= price when no promo)
        discountPercent: number;  // 0 when no promo; otherwise 1-100
        category: string | null;
        size: string | null;
        brand: string | null;
        coverImage: string;
    };
};

type Props = {
    sellerId: string;
    sellerName: string;
    sellerInitials: string;
    sellerSlug: string;
    items: SellerCartItem[];
    bundleMaxItems: number;
    currentUserId: string;
};

// Persist the user's UNCHECKED listing ids in localStorage so flipping a
// checkbox survives navigation, refreshes, and (per device) re-opening the
// cart. Storing the deselected set (rather than the selected one) means new
// items added to the cart default to checked — the common UX expectation.
const CART_DESELECTED_KEY_PREFIX = "modaire:cart-deselected:";
function storageKeyFor(userId: string) {
    return `${CART_DESELECTED_KEY_PREFIX}${userId}`;
}
function readDeselectedSet(userId: string): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = window.localStorage.getItem(storageKeyFor(userId));
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((x): x is string => typeof x === "string"));
    } catch {
        return new Set();
    }
}
function writeDeselectedSet(userId: string, set: Set<string>) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(storageKeyFor(userId), JSON.stringify(Array.from(set)));
    } catch {
        // ignore — Safari private mode etc.
    }
}

export default function SellerCartSection({
    sellerName,
    sellerInitials,
    sellerSlug,
    items,
    bundleMaxItems,
    currentUserId,
}: Props) {
    // Default: every item is pre-selected on first paint. After mount we
    // rehydrate from localStorage and un-select the items the user previously
    // unchecked. There's a brief flash on first visit, which is acceptable
    // and matches the existing localStorage rehydration pattern used in the
    // sell dashboard's "viewed sold" tracking.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(items.map((item) => item.listing.id))
    );

    useEffect(() => {
        const deselected = readDeselectedSet(currentUserId);
        setSelectedIds(
            new Set(items.map((item) => item.listing.id).filter((id) => !deselected.has(id)))
        );
    }, [currentUserId, items]);
    const [removingCartItemId, setRemovingCartItemId] = useState<string | null>(null);
    const [isCheckingOut, startCheckout] = useTransition();
    const [isRemoving, startRemove] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const selectedItems = useMemo(
        () => items.filter((item) => selectedIds.has(item.listing.id)),
        [items, selectedIds]
    );
    // Subtotal reflects what the buyer will actually pay — for on-sale
    // items that's the discounted price, mirroring what checkout charges.
    const selectedSubtotal = selectedItems.reduce((sum, item) => sum + Number(item.listing.effectivePrice), 0);
    const selectedOriginalSubtotal = selectedItems.reduce((sum, item) => sum + Number(item.listing.price), 0);
    const selectedSavings = selectedOriginalSubtotal - selectedSubtotal;
    const selectedCount = selectedItems.length;

    const overCap = selectedCount > bundleMaxItems;
    const noneSelected = selectedCount === 0;
    const itemNoun = items.length === 1 ? "item" : "items";

    function toggleItem(listingId: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(listingId)) next.delete(listingId);
            else next.add(listingId);
            // Persist the change — merge with whatever's already in localStorage
            // for this user (which may include unchecked items from other
            // SellerCartSection components on the same page).
            const stored = readDeselectedSet(currentUserId);
            if (next.has(listingId)) {
                stored.delete(listingId);
            } else {
                stored.add(listingId);
            }
            writeDeselectedSet(currentUserId, stored);
            return next;
        });
    }

    function handleCheckout() {
        if (noneSelected || overCap) return;
        setError(null);
        startCheckout(async () => {
            try {
                await createCheckoutForSellerGroup(selectedItems.map((item) => item.listing.id));
                // Server action redirects on success — code below only runs on
                // unexpected error (validation failure, etc.).
            } catch (err) {
                // NEXT_REDIRECT is how Next.js signals the redirect — it's not
                // a real error; let it propagate up to the runtime.
                if (err && typeof err === "object" && "digest" in err && typeof (err as { digest?: string }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
                    throw err;
                }
                setError(err instanceof Error ? err.message : "Could not start checkout. Please try again.");
            }
        });
    }

    function handleRemove(cartItemId: string) {
        setRemovingCartItemId(cartItemId);
        startRemove(async () => {
            try {
                await removeCartItem(cartItemId);
            } finally {
                setRemovingCartItemId(null);
            }
        });
    }

    return (
        <section className="rounded-[1.45rem] border border-[#ddd3cb] bg-[#fbf8f5] overflow-hidden">
            {/* Seller header — tighter padding to match screenshot density */}
            <Link
                href={`/${sellerSlug}`}
                className="flex items-center gap-2.5 px-4 pt-3.5 pb-3 hover:bg-[#f2ebe4]/40 transition-colors"
            >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#efe6dd] text-[0.78rem] font-semibold text-[#6f5647]">
                    {sellerInitials}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                        <p className="font-semibold text-[0.98rem] leading-tight text-[#2f2925] truncate">{sellerName}</p>
                        <ChevronRight className="h-3.5 w-3.5 text-[#8a7667]" />
                    </div>
                    <p className="mt-0.5 text-[0.76rem] text-[#8a7667]">
                        {items.length} {itemNoun} · Ships from {sellerName}
                    </p>
                </div>
            </Link>

            <div className="border-t border-[#ece3dc]" />

            {/* Items, each with a checkbox — compact row spacing */}
            <ul className="divide-y divide-[#ece3dc]">
                {items.map((item) => {
                    const isChecked = selectedIds.has(item.listing.id);
                    const isThisRemoving = removingCartItemId === item.id;
                    return (
                        <li key={item.id} className="grid grid-cols-[24px_80px_1fr] items-start gap-3 px-4 py-3">
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={isChecked}
                                aria-label={isChecked ? `Deselect ${item.listing.title}` : `Select ${item.listing.title}`}
                                onClick={() => toggleItem(item.listing.id)}
                                className={`mt-1 flex h-5 w-5 items-center justify-center rounded-[5px] border transition-colors ${
                                    isChecked
                                        ? "border-[#5f4437] bg-[#5f4437] text-white"
                                        : "border-[#c8bcb0] bg-white text-transparent hover:border-[#8a7667]"
                                }`}
                            >
                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </button>

                            <Link
                                href={`/listings/${item.listing.id}`}
                                className="relative aspect-[3/4] overflow-hidden rounded-[0.85rem] border border-[#e3d8cf] bg-[#f2ebe4]"
                            >
                                <Image src={item.listing.coverImage} alt={item.listing.title} fill className="object-cover" sizes="80px" />
                            </Link>

                            <div className="flex min-w-0 flex-col">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="line-clamp-2 text-[0.92rem] leading-[1.2] font-semibold text-[#2f2925]">
                                            {item.listing.title}
                                        </h3>
                                        <p className="mt-0.5 truncate text-[0.76rem] text-[#8a7667]">
                                            {item.listing.category || "Fashion"}
                                            {item.listing.size ? ` · Size ${item.listing.size}` : ""}
                                            {item.listing.brand ? ` · ${item.listing.brand}` : ""}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemove(item.id)}
                                        disabled={isThisRemoving || isRemoving}
                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d7cdc4] bg-white text-[#5f4a3c] hover:bg-[#f2ebe4] disabled:opacity-50"
                                        aria-label={`Remove ${item.listing.title}`}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                {item.listing.discountPercent > 0 ? (
                                    <div className="mt-1 flex items-baseline gap-2">
                                        <p className="text-[0.96rem] leading-none font-semibold text-[#2f2925]">
                                            ${Number(item.listing.effectivePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-[0.8rem] leading-none text-[#8a7667] line-through">
                                            ${Number(item.listing.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </p>
                                        <span className="rounded-full bg-[#4a3328] px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.12em] text-white">
                                            {item.listing.discountPercent}% Off
                                        </span>
                                    </div>
                                ) : (
                                    <p className="mt-1 text-[0.96rem] leading-none font-semibold text-[#2f2925]">
                                        ${Number(item.listing.price).toLocaleString()}
                                    </p>
                                )}
                                <div className="mt-2">
                                    <Link
                                        href={`/listings/${item.listing.id}`}
                                        className="inline-flex h-7 items-center rounded-full border border-[#d7cdc4] bg-white px-3 text-[0.76rem] font-medium text-[#5f4a3c] hover:bg-[#f2ebe4]"
                                    >
                                        View Item
                                    </Link>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>

            <div className="border-t border-[#ece3dc]" />

            {/* Footer — tightened */}
            <div className="px-4 py-3">
                <div className="flex items-center justify-between text-[0.88rem] text-[#5a4426]">
                    <span>Items selected ({selectedCount})</span>
                    <span className="font-semibold text-[#2f2925]">${selectedSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                {selectedSavings > 0 ? (
                    <div className="mt-0.5 flex items-center justify-between text-[0.82rem] text-[#7a5a45]">
                        <span>Sale savings</span>
                        <span className="font-semibold">−${selectedSavings.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                ) : null}
                <div className="mt-0.5 flex items-center justify-between text-[0.92rem]">
                    <span className="text-[#5a4426]">Subtotal</span>
                    <span className="text-[1.05rem] font-semibold text-[#2f2925]">${selectedSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>

                {overCap ? (
                    <p className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[0.76rem] text-amber-800">
                        You can checkout up to {bundleMaxItems} items together. Uncheck a few to continue.
                    </p>
                ) : null}

                {error ? (
                    <p className="mt-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[0.76rem] text-red-700">
                        {error}
                    </p>
                ) : null}

                <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={noneSelected || overCap || isCheckingOut}
                    className="mt-2.5 w-full rounded-full bg-[#5f4437] py-3 text-[0.9rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#4a3328] disabled:cursor-not-allowed disabled:bg-[#5f4437]/40"
                >
                    {isCheckingOut
                        ? "Starting checkout…"
                        : noneSelected
                            ? "Select items to checkout"
                            : `Checkout Selected Items (${selectedCount})`}
                </button>

                <p className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-[0.72rem] text-[#8a7667]">
                    <ShieldCheck className="h-3 w-3" />
                    Secure checkout · Your items are safe with us
                </p>
            </div>
        </section>
    );
}
