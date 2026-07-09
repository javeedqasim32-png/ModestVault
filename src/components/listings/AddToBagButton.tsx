"use client";

import { useState, useTransition } from "react";
import { ShoppingBag } from "lucide-react";
import SignInPromptModal from "@/components/auth/SignInPromptModal";
import { trackMetaEvent } from "@/lib/meta-pixel";

/**
 * Listing-detail "Add to Bag" CTA. For authed users it calls the existing
 * server action (`addToCartAndRedirect`) which writes the cart row and
 * redirects to /cart. For guests it intercepts the click and shows the
 * sign-in modal instead of yanking them to /login. After login they bounce
 * back to the listing detail page (where they can tap Add to Bag again).
 */
export default function AddToBagButton({
    listingId,
    isAuthed,
    price,
    addToCartAction,
}: {
    listingId: string;
    isAuthed: boolean;
    price?: number;
    /** Server action that adds the listing to the cart and redirects. Pre-bound
     *  by the server component caller so the action only needs to know its
     *  listingId argument at call time. */
    addToCartAction: () => Promise<void>;
}) {
    const [promptOpen, setPromptOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    return (
        <>
            <button
                type="button"
                disabled={isPending}
                onClick={() => {
                    if (!isAuthed) {
                        setPromptOpen(true);
                        return;
                    }
                    // Fire pixel BEFORE the transition — the server action
                    // redirects, so an "after" call would never run.
                    trackMetaEvent("AddToCart", {
                        content_ids: [listingId],
                        content_type: "product",
                        value: price,
                        currency: "USD",
                    });
                    startTransition(() => addToCartAction());
                }}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-[#a07c61] bg-[#a07c61] px-3 text-[12px] font-medium text-white whitespace-nowrap disabled:opacity-70"
            >
                <ShoppingBag className="h-4 w-4" />
                Add to Bag
            </button>
            <SignInPromptModal
                open={promptOpen}
                onClose={() => setPromptOpen(false)}
                intent="cart"
                callbackUrl={`/listings/${listingId}`}
            />
        </>
    );
}
