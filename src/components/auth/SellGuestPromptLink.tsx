"use client";

import { useState } from "react";
import SignInPromptModal from "./SignInPromptModal";

/**
 * Thin client wrapper used in the (server-rendered) desktop Navbar wherever a
 * guest-facing "Sell" link lives. Renders a button that opens the sign-in
 * modal instead of navigating away. Children + className mirror what an
 * equivalent <Link> would have rendered so visual styling stays identical.
 */
export default function SellGuestPromptLink({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={className}
            >
                {children}
            </button>
            <SignInPromptModal
                open={open}
                onClose={() => setOpen(false)}
                intent="sell"
                callbackUrl="/sell"
            />
        </>
    );
}
