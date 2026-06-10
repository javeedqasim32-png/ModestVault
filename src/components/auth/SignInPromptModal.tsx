"use client";

import Link from "next/link";
import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Generic "sign in to do this" modal shown when a guest tries to take an
 * action that requires an account. Replaces the previous hard redirects to
 * /login that appeared across the app. Each `intent` has its own
 * copy + emoji; the two CTAs always preserve the post-login bounce-back via
 * `callbackUrl`.
 */
export type SignInPromptIntent =
    | "sell"
    | "favorite"
    | "cart"
    | "message"
    | "orders"
    | "account";

type IntentCopy = {
    title: string;
    subtitle: string;
    emoji: string;
    // Sell leads with "Create account" (sellers are typically new); everything
    // else leads with "Sign in" (action-takers are typically returning users).
    primary: "signup" | "signin";
};

const INTENTS: Record<SignInPromptIntent, IntentCopy> = {
    sell: {
        title: "Sign in to start selling",
        subtitle: "Create a free Modaire account to list items, keep 85% of every sale, and message buyers.",
        emoji: "🛍️",
        primary: "signup",
    },
    favorite: {
        title: "Sign in to save favorites",
        subtitle: "Sign in or create a free account to save listings you love so you can come back to them later.",
        emoji: "🤍",
        primary: "signin",
    },
    cart: {
        title: "Sign in to add to your bag",
        subtitle: "Sign in or create a free account to build your bag and check out securely.",
        emoji: "👜",
        primary: "signin",
    },
    message: {
        title: "Sign in to message the seller",
        subtitle: "Sign in or create a free account to start a conversation about this listing.",
        emoji: "💬",
        primary: "signin",
    },
    orders: {
        title: "Sign in to view your orders",
        subtitle: "Sign in or create a free account to track your orders and see your purchase history.",
        emoji: "📦",
        primary: "signin",
    },
    account: {
        title: "Sign in to your account",
        subtitle: "Sign in or create a free account to manage your profile, favorites, and settings.",
        emoji: "👋",
        primary: "signin",
    },
};

export default function SignInPromptModal({
    open,
    onClose,
    intent,
    callbackUrl = "/",
}: {
    open: boolean;
    onClose: () => void;
    intent: SignInPromptIntent;
    /** Path to bounce the user back to after login. Defaults to "/". */
    callbackUrl?: string;
}) {
    // Lock background scroll while open
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    const copy = INTENTS[intent];
    const cb = encodeURIComponent(callbackUrl);
    const signupHref = `/signup?callbackUrl=${cb}`;
    const signinHref = `/login?callbackUrl=${cb}`;
    const primaryHref = copy.primary === "signup" ? signupHref : signinHref;
    const primaryLabel = copy.primary === "signup" ? "Create account" : "Sign in";
    const secondaryHref = copy.primary === "signup" ? signinHref : signupHref;
    const secondaryLabel =
        copy.primary === "signup" ? "Already have an account? Sign in" : "New here? Create an account";

    return (
        <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 px-4 py-6"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-prompt-title"
        >
            <div
                className="relative max-h-[92dvh] w-full max-w-[420px] overflow-y-auto rounded-[28px] bg-[#fbf7f1] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    className="absolute right-4 top-4 text-[#8a7667] hover:text-[#2f2925]"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="mx-auto mt-2 flex h-20 items-end justify-center text-6xl" aria-hidden="true">
                    {copy.emoji}
                </div>

                <h2
                    id="signin-prompt-title"
                    className="mt-4 text-center text-[26px] font-medium leading-tight text-[#2f2925]"
                    style={{ fontFamily: "var(--font-serif), serif" }}
                >
                    {copy.title}
                </h2>
                <p className="mt-2 text-center text-[14px] leading-[1.4] text-[#7a6050]">
                    {copy.subtitle}
                </p>

                <Link
                    href={primaryHref}
                    onClick={onClose}
                    className="mt-6 flex w-full items-center justify-center rounded-full bg-[#5f4437] py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#4a3328]"
                >
                    {primaryLabel}
                </Link>
                <Link
                    href={secondaryHref}
                    onClick={onClose}
                    className="mt-3 flex w-full items-center justify-center text-[14px] font-medium text-[#5f4437] hover:opacity-80"
                >
                    {secondaryLabel}
                </Link>
            </div>
        </div>
    );
}
