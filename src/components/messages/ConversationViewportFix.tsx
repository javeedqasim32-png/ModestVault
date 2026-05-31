"use client";

import { useEffect } from "react";

/**
 * Thread-page side-effects:
 *  - Lock document scroll while the thread is mounted so swiping the message
 *    list doesn't drag the outer page or rubber-band Safari.
 *  - Snap the message list to the bottom on mount, on keyboard open/close
 *    (visualViewport `resize`), and whenever the composer wrapper changes
 *    height (ResizeObserver). The composer-resize observer is what keeps
 *    the latest message visible as the contentEditable auto-grows while
 *    the user types.
 *  - We deliberately do NOT listen to visualViewport `scroll` — it fires
 *    continuously on iOS and causes jank.
 *  - We do NOT try to track keyboard height via CSS variables; the thread
 *    container relies on `fixed inset-0` (no explicit height) so iOS Safari
 *    naturally tracks the visual viewport.
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

        // Re-snap when the composer auto-grows (or shrinks). Without this, the
        // composer's growth eats into the messages area's visible height and
        // the latest bubble scrolls out of view above the top edge.
        const composer = document.getElementById("conversation-composer");
        let composerObserver: ResizeObserver | null = null;
        if (composer && typeof ResizeObserver !== "undefined") {
            composerObserver = new ResizeObserver(() => {
                window.requestAnimationFrame(scrollToLatest);
            });
            composerObserver.observe(composer);
        }

        return () => {
            if (vv) vv.removeEventListener("resize", onResize);
            window.removeEventListener("pageshow", scrollToLatest);
            composerObserver?.disconnect();
            root.style.overflow = previousHtmlOverflow;
            body.style.overflow = previousBodyOverflow;
            body.style.overscrollBehavior = previousBodyOverscroll;
        };
    }, [messageCount]);

    return null;
}
