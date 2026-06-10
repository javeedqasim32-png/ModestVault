"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import SignInPromptModal from "@/components/auth/SignInPromptModal";

/**
 * Listing-detail "Message Seller" icon. For authed users it links to
 * /messages/start which opens (or creates) a thread with the seller. For
 * guests it shows the sign-in modal instead of dumping them onto /login.
 */
export default function MessageSellerButton({
    listingId,
    sellerId,
    isAuthed,
}: {
    listingId: string;
    sellerId: string;
    isAuthed: boolean;
}) {
    const [promptOpen, setPromptOpen] = useState(false);
    const href = `/messages/start?sellerId=${sellerId}&listingId=${listingId}`;
    const className = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ddd3cb] bg-[#fbf8f5] text-[#2f2925]";

    if (isAuthed) {
        return (
            <Link href={href} aria-label="Message seller" className={className}>
                <MessageCircle className="h-5 w-5" />
            </Link>
        );
    }

    return (
        <>
            <button
                type="button"
                aria-label="Message seller"
                onClick={() => setPromptOpen(true)}
                className={className}
            >
                <MessageCircle className="h-5 w-5" />
            </button>
            <SignInPromptModal
                open={promptOpen}
                onClose={() => setPromptOpen(false)}
                intent="message"
                callbackUrl={`/listings/${listingId}`}
            />
        </>
    );
}
