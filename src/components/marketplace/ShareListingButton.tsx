"use client";

import { SquareArrowUp } from "lucide-react";

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
                window.alert("Link shared.");
                return;
            } catch {
                // User cancelled or share failed; continue to clipboard fallback.
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
            <SquareArrowUp className={iconClassName} />
        </button>
    );
}
