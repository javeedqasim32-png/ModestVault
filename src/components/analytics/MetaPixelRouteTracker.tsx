"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackMetaEvent } from "@/lib/meta-pixel";

/**
 * Fires fbq('track', 'PageView') on every client-side route change.
 *
 * The base pixel <Script> already fires one PageView on hard load, but
 * App Router client navigation doesn't re-execute the script — we need
 * this component to catch every subsequent route. Admin routes are
 * excluded so ad-optimization signal isn't polluted by admin behavior.
 */
export function MetaPixelRouteTracker() {
    const pathname = usePathname();

    useEffect(() => {
        if (!pathname) return;
        if (pathname.startsWith("/admin")) return;
        trackMetaEvent("PageView");
    }, [pathname]);

    return null;
}
