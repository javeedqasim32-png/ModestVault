"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Resets window scroll to (0,0) on forward navigation (Link / router.push),
// but skips on back/forward (popstate) so the browser's native scroll
// restoration can take the user back to where they were. popstate fires
// before Next.js re-renders the new pathname, so the ref is already set by
// the time the second effect runs.
export default function ScrollToTopOnPathChange() {
    const pathname = usePathname();
    const skipNextResetRef = useRef(false);

    useEffect(() => {
        const onPopState = () => { skipNextResetRef.current = true; };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    useEffect(() => {
        if (skipNextResetRef.current) {
            skipNextResetRef.current = false;
            return;
        }
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }, [pathname]);

    return null;
}
