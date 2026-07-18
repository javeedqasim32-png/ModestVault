"use client";

import { useState } from "react";
import Link from "next/link";
import SignInPromptModal, { type SignInPromptIntent } from "@/components/auth/SignInPromptModal";

/**
 * Same visual affordance as a next/link, but for guests it opens a
 * SignInPromptModal instead of navigating. For authed users it behaves
 * as a plain Link.
 *
 * Use for entry-point tiles into auth-gated flows (dashboard cards,
 * settings rows) — the client-side modal is a nicer UX than the hard
 * server-side redirect the destination page would otherwise do.
 *
 * The `guestIntent` field picks the copy variant on the modal (see
 * SignInPromptModal INTENTS) so "Orders" says "Sign in to view your
 * orders", "Sell" says "Sign in to start selling", etc.
 */
export function GuestGuardedLink({
    href,
    isAuthed,
    guestIntent,
    className,
    children,
}: {
    href: string;
    isAuthed: boolean;
    guestIntent: SignInPromptIntent;
    className?: string;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);

    if (isAuthed) {
        return (
            <Link href={href} className={className}>
                {children}
            </Link>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    setOpen(true);
                }}
                className={className}
            >
                {children}
            </button>
            <SignInPromptModal
                open={open}
                onClose={() => setOpen(false)}
                intent={guestIntent}
                callbackUrl={href}
            />
        </>
    );
}
