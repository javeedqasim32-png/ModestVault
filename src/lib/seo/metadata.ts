// Central helper for composing per-page Next.js Metadata objects with
// consistent Open Graph, Twitter, and canonical URL fields. Every
// page-level `metadata` / `generateMetadata` call in the app should
// route through here so shared decisions (site name suffix, OG image
// fallback, twitter card style, canonical hostname) live in one place.

import type { Metadata } from "next";
import { SITE_CONFIG, SITE_URL, absoluteUrl } from "./site";

export type BuildPageMetadataInput = {
    /** Page title. The site name is appended automatically ("<title> — Modaire"). Pass null to skip the suffix (e.g. for the root/home). */
    title: string | null;
    /** Meta description. Aim for 140-160 chars. */
    description: string;
    /** Page path relative to the site root (e.g. "/browse" or "/listings/abc"). Drives canonical + og:url. */
    path: string;
    /** Absolute or root-relative image URL for OG/Twitter. When omitted, Next.js auto-generates one via opengraph-image.tsx (layout-scoped). */
    image?: string;
    /** Optional per-page override; defaults to summary_large_image. */
    twitterCard?: "summary" | "summary_large_image";
    /** Rare — override the site suffix behavior on a per-page basis. */
    noSuffix?: boolean;
};

export function buildPageMetadata(input: BuildPageMetadataInput): Metadata {
    const canonical = absoluteUrl(input.path);
    const fullTitle = input.title === null || input.noSuffix
        ? (input.title ?? SITE_CONFIG.fullName)
        : `${input.title} — ${SITE_CONFIG.name}`;

    // Only include images when an explicit one is passed. Omitting the
    // key lets Next.js's file-based opengraph-image.tsx take over —
    // which is exactly what we want for pages that don't have a
    // per-page image (all static pages).
    const ogImages = input.image ? [{ url: absoluteUrl(input.image) }] : undefined;

    return {
        title: fullTitle,
        description: input.description,
        alternates: {
            canonical,
        },
        openGraph: {
            title: fullTitle,
            description: input.description,
            url: canonical,
            siteName: SITE_CONFIG.name,
            type: "website",
            ...(ogImages ? { images: ogImages } : {}),
        },
        twitter: {
            card: input.twitterCard ?? "summary_large_image",
            title: fullTitle,
            description: input.description,
            ...(ogImages ? { images: ogImages.map((i) => i.url) } : {}),
        },
    };
}

// Re-export for convenience so callers only need one import from this module.
export { SITE_CONFIG, SITE_URL, absoluteUrl };
