"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function HomeBackRefresh() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    let lastRefreshTs = 0;
    const hardReload = () => {
      // For back/forward cache restores, force fresh SSR cookies on Home.
      window.location.reload();
    };

    const refreshSafely = () => {
      const now = Date.now();
      if (now - lastRefreshTs < 400) return;
      lastRefreshTs = now;
      router.refresh();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        hardReload();
        return;
      }
      refreshSafely();
    };

    const onPopState = () => {
      // Browser back/forward on mobile can restore stale server snapshot.
      hardReload();
    };

    const onFocus = () => refreshSafely();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSafely();
    };

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname, router]);

  return null;
}
