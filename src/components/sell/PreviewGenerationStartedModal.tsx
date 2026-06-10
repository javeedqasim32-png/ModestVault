"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect } from "react";

type Props = {
    open: boolean;
    onClose: () => void;
};

export default function PreviewGenerationStartedModal({ open, onClose }: Props) {
    useEffect(() => {
        if (!open) return;
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-6"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-generation-started-title"
        >
            <div
                className="relative w-full max-w-[380px] rounded-[24px] bg-[#fbf7f1] px-7 pb-7 pt-9 shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
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

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f3e7d8]">
                    <Sparkles className="h-7 w-7 text-[#cfb79f]" strokeWidth={2} />
                </div>

                <h2
                    id="preview-generation-started-title"
                    className="mt-5 text-center text-[22px] font-semibold text-[#2f2925]"
                >
                    Creating your preview
                </h2>
                <p className="mt-2 text-center text-[15px] leading-relaxed text-[#7a6050]">
                    This usually takes 2–4 minutes. Feel free to browse — the bell 🔔 will alert you when your styled cover is ready.
                </p>

                <button
                    type="button"
                    onClick={onClose}
                    className="mt-7 w-full rounded-full bg-[#5f4437] py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#4a3328]"
                    autoFocus
                >
                    Got it
                </button>
            </div>
        </div>
    );
}
