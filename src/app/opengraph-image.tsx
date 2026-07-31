// Dynamic Open Graph card for pages that don't set their own image.
// Next.js renders this at build time and serves it as og-image.png
// (through layout.tsx metadata). Replaces the deleted static
// public/og-image.png with a code-generated, always-in-sync card
// so Facebook / Twitter / iMessage previews render correctly.
//
// Per-listing pages override this by setting `openGraph.images` in
// their own generateMetadata — see src/app/listings/[id]/page.tsx.

import { ImageResponse } from "next/og";
import { SITE_CONFIG } from "@/lib/seo/site";

export const runtime = "edge";
export const alt = SITE_CONFIG.fullName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                        `linear-gradient(135deg, ${SITE_CONFIG.espressoBrand} 0%, #6b4a3a 100%)`,
                    color: SITE_CONFIG.creamBrand,
                    fontFamily: "sans-serif",
                }}
            >
                <div
                    style={{
                        fontSize: 140,
                        fontWeight: 700,
                        letterSpacing: "0.28em",
                        marginBottom: 24,
                    }}
                >
                    MODAIRE
                </div>
                <div
                    style={{
                        fontSize: 42,
                        fontWeight: 400,
                        letterSpacing: "0.04em",
                        opacity: 0.9,
                    }}
                >
                    {SITE_CONFIG.tagline}
                </div>
            </div>
        ),
        { ...size },
    );
}
