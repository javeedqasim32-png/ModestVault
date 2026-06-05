"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

type Props = {
    fallbackHref: string;
    label?: string;
    className?: string;
};

// Tries router.back() so the browser restores the previous page's scroll
// position (paired with ScrollToTopOnPathChange skipping on popstate).
// Falls back to a forward push if there is no in-app history — e.g., the
// user landed here from a shared link — so they can't get bounced off-site.
export default function SmartBackButton({ fallbackHref, label = "Back", className }: Props) {
    const router = useRouter();
    const onClick = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push(fallbackHref);
        }
    };
    return (
        <button type="button" onClick={onClick} className={className}>
            <ChevronLeft className="h-4 w-4" />
            {label}
        </button>
    );
}
