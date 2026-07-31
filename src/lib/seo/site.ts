// SEO-facing site constants. Kept sync so it can be read from
// file-based route handlers (sitemap.ts, robots.ts, opengraph-image.tsx)
// which run outside a request and can't use src/lib/app-url.ts's
// header-based resolution.

const RAW_URL = process.env.NEXT_PUBLIC_APP_URL || "https://shopmodaire.com";

// Strip trailing slash so absoluteUrl composition never doubles slashes.
export const SITE_URL = RAW_URL.replace(/\/$/, "");

export const SITE_CONFIG = {
    name: "Modaire",
    fullName: "Modaire — Modest Fashion Marketplace",
    tagline: "Modest Fashion Marketplace",
    defaultDescription:
        "Modaire is the modest fashion marketplace for preloved and new abayas, kaftans, hijabs, shalwar kameez, and Pakistani bridal wear. Buy and sell modest clothing sustainably.",
    twitterHandle: "@shopmodaire", // update if actual handle differs
    espressoBrand: "#4a3328",
    creamBrand: "#faf8f5",
} as const;

/**
 * Turn a route path into a fully-qualified absolute URL. Used everywhere
 * SEO metadata needs a real URL — canonical, sitemap entries, og:url.
 */
export function absoluteUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `${SITE_URL}${clean}`;
}
