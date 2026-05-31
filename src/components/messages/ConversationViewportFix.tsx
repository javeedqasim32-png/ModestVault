"use client";

import { useEffect } from "react";

/**
 * Thread-page side-effects:
 *  - Lock document scroll while the thread is mounted so swiping the message
 *    list doesn't drag the outer page or rubber-band Safari.
 *  - Snap the message list to the bottom on mount and again on keyboard
 *    open/close (visualViewport `resize`). We deliberately do NOT listen to
 *    visualViewport `scroll` — it fires continuously on iOS and causes jank.
 *  - We do NOT try to track keyboard height via CSS variables; trust the
 *    browser's built-in handling and rely on `fixed inset-0 h-[100dvh]` plus
 *    body scroll lock.
 */
export default function ConversationViewportFix({ messageCount = 0 }: { messageCount?: number }) {
    useEffect(() => {
        const root = document.documentElement;
        const body = document.body;
        const previousHtmlOverflow = root.style.overflow;
        const previousBodyOverflow = body.style.overflow;
        const previousBodyOverscroll = body.style.overscrollBehavior;
        root.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "contain";

        const scrollToLatest = () => {
            const scroller = document.getElementById("conversation-scroll");
            if (!scroller) return;
            scroller.scrollTop = scroller.scrollHeight;
        };

        [0, 40, 120, 260].forEach((delay) => window.setTimeout(scrollToLatest, delay));

        const vv = window.visualViewport;
        const onResize = () => window.requestAnimationFrame(scrollToLatest);
        if (vv) vv.addEventListener("resize", onResize);
        window.addEventListener("pageshow", scrollToLatest);

        return () => {
            if (vv) vv.removeEventListener("resize", onResize);
            window.removeEventListener("pageshow", scrollToLatest);
            root.style.overflow = previousHtmlOverflow;
            body.style.overflow = previousBodyOverflow;
            body.style.overscrollBehavior = previousBodyOverscroll;
        };
    }, [messageCount]);

    return null;
}
