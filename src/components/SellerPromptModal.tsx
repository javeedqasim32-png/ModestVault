"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { onboardSellerAction } from "@/app/actions/stripe";

const DISMISS_KEY = "modaire_seller_prompt_dismissed";
const FIRST_VISIT_KEY = "modaire_first_visit_ts";
const SHOW_AFTER_MS = 15 * 1000; // 15 seconds of cumulative session time

const COPY = {
    new: {
        eyebrow: "Welcome to Modaire",
        heading: "Got pieces sitting in your closet?",
        body: "Set up in minutes.",
        cta: "Get Started",
    },
    partial: {
        eyebrow: "Almost There",
        heading: "Just a few details left.",
        body: "Finish setup to start selling.",
        cta: "Finish Setup",
    },
} as const;

export default function SellerPromptModal({ state }: { state: "new" | "partial" }) {
    const [visible, setVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (sessionStorage.getItem(DISMISS_KEY) === "true") return;

        // Record the very first page load of this browser session. Persisted across
        // page navigations via sessionStorage so the timer is cumulative for the
        // whole site, not per-page.
        let firstVisit = sessionStorage.getItem(FIRST_VISIT_KEY);
        if (!firstVisit) {
            firstVisit = String(Date.now());
            sessionStorage.setItem(FIRST_VISIT_KEY, firstVisit);
        }

        const elapsed = Date.now() - Number(firstVisit);
        if (elapsed >= SHOW_AFTER_MS) {
            // Threshold already crossed on a previous page — show immediately.
            setVisible(true);
            return;
        }

        // Schedule the remaining time until the threshold is reached.
        const remaining = SHOW_AFTER_MS - elapsed;
        const timer = setTimeout(() => setVisible(true), remaining);
        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        sessionStorage.setItem(DISMISS_KEY, "true");
        setVisible(false);
    };

    const handleStart = async () => {
        try {
            setSubmitting(true);
            setError("");
            const result = await onboardSellerAction();
            if (result?.url) {
                window.location.href = result.url;
                return;
            }
            setError("Could not start onboarding. Please try again.");
            setSubmitting(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start onboarding.");
            setSubmitting(false);
        }
    };

    if (!visible) return null;

    const copy = COPY[state];

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[6px]"
            onClick={handleDismiss}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="seller-prompt-heading"
                className="relative w-full max-w-[340px] overflow-hidden rounded-[1rem] border border-border/60 bg-[#faf6f3] shadow-[0_20px_50px_rgba(60,40,30,0.18)]"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="Dismiss"
                    className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                </button>

                <div className="px-7 pt-8 pb-7">
                    <p className="text-[9px] font-medium uppercase tracking-[0.36em] text-primary/80">
                        {copy.eyebrow}
                    </p>

                    <h2
                        id="seller-prompt-heading"
                        className="mt-3 font-serif text-[24px] font-normal leading-[1.15] text-foreground"
                    >
                        {copy.heading}
                    </h2>

                    <div className="mt-3 h-px w-8 bg-primary/30" />

                    <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                        {copy.body}
                    </p>

                    {error && (
                        <p className="mt-3 text-[11px] text-destructive">
                            {error}
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={submitting}
                        className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-foreground bg-foreground px-6 py-3 text-[10px] font-medium uppercase tracking-[0.28em] text-background transition-colors hover:bg-transparent hover:text-foreground disabled:opacity-50"
                    >
                        {submitting ? "Connecting…" : copy.cta}
                    </button>
                </div>
            </div>
        </div>
    );
}
