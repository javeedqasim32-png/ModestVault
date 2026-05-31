"use client";

import { Upload } from "lucide-react";

type ShareListingButtonProps = {
    title: string;
    className?: string;
    iconClassName?: string;
};

export default function ShareListingButton({ title, className = "", iconClassName = "h-4 w-4" }: ShareListingButtonProps) {
    const copyToClipboard = async (text: string) => {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textArea);
        return copied;
    };

    const handleShare = async () => {
        const url = window.location.href;

        if (navigator.share) {
            try {
                await navigator.share({ title, url });
                // Share sheet provides its own confirmation — no in-app feedback needed.
                return;
            } catch (err) {
                // User cancelled the share sheet (AbortError) — silently bail,
                // do NOT fall through to clipboard / prompt, which would surface
                // the unwanted "URL" box after they dismissed the share.
                if (err instanceof DOMException && err.name === "AbortError") {
                    return;
                }
                // Genuine share failure — continue to clipboard fallback.
            }
        }

        try {
            const copied = await copyToClipboard(url);
            if (copied) {
                window.alert("Listing link copied.");
                return;
            }
        } catch {
            // Continue to manual fallback below.
        }

        // Last-resort fallback: only reached when share is unavailable AND
        // clipboard write failed (e.g. insecure HTTP context).
        window.prompt("Copy listing link:", url);
    };

    return (
        <button
            type="button"
            onClick={() => {
                void handleShare();
            }}
            aria-label="Share listing"
            title="Share listing"
            className={className}
        >
            <Upload className={iconClassName} strokeWidth={1.8} />
        </button>
    );
}
