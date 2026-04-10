"use client";

import { useEffect, useRef } from "react";

export default function ConversationViewportFix({ messageCount = 0 }: { messageCount?: number }) {
    const lastViewportHeightRef = useRef<number | null>(null);

    useEffect(() => {
        const vv = window.visualViewport;
        const getComposerInput = () => document.querySelector<HTMLInputElement>('input[name="body"]');

        const scrollToLatest = () => {
            const anchor = document.getElementById("conversation-latest-anchor");
            if (!anchor) return;
            window.requestAnimationFrame(() => {
                anchor.scrollIntoView({ behavior: "auto", block: "end" });
            });
        };

        const keepComposerVisible = () => {
            const input = getComposerInput();
            if (!input) return;
            window.requestAnimationFrame(() => {
                input.scrollIntoView({ behavior: "auto", block: "nearest" });
            });
        };

        const stabilize = () => {
            // Let Safari finish keyboard/layout animation first, then snap to latest.
            window.setTimeout(scrollToLatest, 40);
        };

        const runInitialSnap = () => {
            // Safari can apply layout/scroll restoration after first paint.
            // Retry a few times to guarantee landing on latest message.
            [0, 40, 120, 260].forEach((delay) => {
                window.setTimeout(scrollToLatest, delay);
            });
        };

        // Initial enter / re-enter to thread should start at latest message.
        runInitialSnap();

        const onViewportResize = () => {
            // On iOS, keyboard open shrinks visual viewport.
            // Keep composer visible while keyboard is open; re-stick to latest on close.
            if (!vv) {
                stabilize();
                return;
            }
            const current = vv.height;
            const prev = lastViewportHeightRef.current;
            lastViewportHeightRef.current = current;
            if (prev == null) return;
            const keyboardLikelyOpened = current < prev;
            const keyboardLikelyClosed = current > prev;
            if (keyboardLikelyOpened) {
                window.setTimeout(keepComposerVisible, 20);
            }
            if (keyboardLikelyClosed) stabilize();
        };
        const onFocusIn = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (target?.getAttribute("name") === "body") {
                window.setTimeout(keepComposerVisible, 30);
            }
        };
        const onFocusOut = (event: FocusEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.getAttribute("name") === "body") stabilize();
        };
        const onPageShow = () => stabilize();
        const onWindowFocus = () => stabilize();
        const onVisibility = () => {
            if (document.visibilityState === "visible") stabilize();
        };

        if (vv) {
            lastViewportHeightRef.current = vv.height;
            vv.addEventListener("resize", onViewportResize);
        }
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);
        window.addEventListener("pageshow", onPageShow);
        window.addEventListener("focus", onWindowFocus);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            if (vv) {
                vv.removeEventListener("resize", onViewportResize);
            }
            document.removeEventListener("focusin", onFocusIn);
            document.removeEventListener("focusout", onFocusOut);
            window.removeEventListener("pageshow", onPageShow);
            window.removeEventListener("focus", onWindowFocus);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [messageCount]);

    return null;
}
