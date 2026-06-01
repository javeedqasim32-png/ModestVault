"use client";

import { useEffect, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import { Counter, Zoom } from "yet-another-react-lightbox/plugins";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";

// CSS overrides for the library:
// - Hide the Zoom plugin's auto-injected +/- buttons (toolbar.buttons can't
//   suppress plugin-added buttons; CSS by aria-label is the reliable fix).
// - Re-skin the toolbar icons + counter for our cream backdrop so they read
//   as dark instead of white-on-cream.
const LIGHTBOX_CSS_OVERRIDES = `
.yarl__toolbar .yarl__button[aria-label="Zoom in"],
.yarl__toolbar .yarl__button[aria-label="Zoom out"] {
    display: none !important;
}
.yarl__root {
    --yarl__color_button: #2f2925;
    --yarl__color_button_active: #4a3328;
    --yarl__color_button_disabled: rgba(47, 41, 37, 0.35);
}
.yarl__counter {
    color: #2f2925;
    text-shadow: none;
}
`;

// Thin wrapper around yet-another-react-lightbox that keeps the listing-gallery
// component free of lightbox-config noise. Renders a fullscreen viewer over a
// solid black backdrop with swipe between images, counter ("1 / N"),
// pinch-to-zoom, double-tap zoom, ESC-to-close, and body-scroll lock — all
// handled by the library. The buyer always sees the full uncropped image
// regardless of aspect ratio.
//
// One-time "Double-tap to zoom" hint: many buyers don't realize landscape
// photos can be zoomed to fill the screen. We surface this once per device
// when the lightbox first opens, then never again.

const ZOOM_HINT_SEEN_KEY = "modaire_lightbox_zoom_hint_seen";
const ZOOM_HINT_DURATION_MS = 2800;

type ListingLightboxProps = {
    images: { src: string; alt?: string }[];
    open: boolean;
    index: number;
    onClose: () => void;
};

export default function ListingLightbox({ images, open, index, onClose }: ListingLightboxProps) {
    const [showZoomHint, setShowZoomHint] = useState(false);

    useEffect(() => {
        if (!open) return;
        let alreadySeen = false;
        try {
            alreadySeen = window.localStorage.getItem(ZOOM_HINT_SEEN_KEY) === "1";
        } catch {
            // localStorage may be blocked; fall through and show the hint anyway.
        }
        if (alreadySeen) return;

        setShowZoomHint(true);
        const timer = window.setTimeout(() => {
            setShowZoomHint(false);
            try {
                window.localStorage.setItem(ZOOM_HINT_SEEN_KEY, "1");
            } catch {
                // Persistence failure is non-fatal — the hint just shows again next time.
            }
        }, ZOOM_HINT_DURATION_MS);
        return () => window.clearTimeout(timer);
    }, [open]);

    return (
        <>
            <style>{LIGHTBOX_CSS_OVERRIDES}</style>
            <Lightbox
                open={open}
                close={onClose}
                slides={images}
                index={index}
                plugins={[Counter, Zoom]}
                // Both close + counter on the right edge of the top bar.
                // X sits at the very corner (toolbar default position);
                // counter sits just to its left with enough offset to clear
                // the X button.
                counter={{ container: { style: { top: 0, right: 56, left: "unset", bottom: "unset" } } }}
                zoom={{
                    maxZoomPixelRatio: 3,
                    doubleTapDelay: 250,
                    doubleClickDelay: 250,
                    doubleClickMaxStops: 2,
                    pinchZoomDistanceFactor: 100,
                }}
                controller={{ closeOnBackdropClick: true }}
                styles={{ container: { backgroundColor: "#f6f1e8" } }}
            />
            {open && showZoomHint ? (
                <div
                    aria-hidden
                    className="pointer-events-none fixed left-1/2 z-[10000] -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-[#2f2925] shadow-[0_4px_12px_rgba(0,0,0,0.35)] backdrop-blur"
                    style={{ bottom: "max(2rem, env(safe-area-inset-bottom))" }}
                >
                    Double-tap to zoom
                </div>
            ) : null}
        </>
    );
}
