/**
 * Thin, safe wrapper around window.fbq for Meta Pixel event tracking.
 *
 * Every call site imports trackMetaEvent() instead of touching window.fbq
 * directly — that way SSR, unit tests, and dev-without-env-var all
 * silently no-op instead of ReferenceError'ing.
 *
 * The pixel bootstrap itself lives in src/app/layout.tsx as a next/script
 * tag that only renders when NEXT_PUBLIC_META_PIXEL_ID is set. So on a
 * dev machine without the env var, the whole pipeline is a no-op.
 */

// Meta's standard events — the ones the ads platform recognizes for
// optimization. Free-form strings would work too, but the type helps
// catch typos at call sites.
export type MetaStandardEvent =
    | "PageView"
    | "ViewContent"
    | "AddToCart"
    | "AddToWishlist"
    | "InitiateCheckout"
    | "Purchase"
    | "CompleteRegistration"
    | "Search"
    | "Lead"
    | "Contact";

declare global {
    interface Window {
        fbq?: (
            command: "init" | "track" | "trackCustom",
            eventName: string,
            params?: Record<string, unknown>,
        ) => void;
    }
}

export function trackMetaEvent(
    event: MetaStandardEvent,
    params?: Record<string, unknown>,
): void {
    if (typeof window === "undefined") return;
    if (typeof window.fbq !== "function") return;
    try {
        window.fbq("track", event, params);
    } catch {
        // Never let analytics break the app.
    }
}
