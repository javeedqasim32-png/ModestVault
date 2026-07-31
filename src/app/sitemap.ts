// File-based sitemap. Next.js turns this into /sitemap.xml at build
// time (statically) and reruns it at revalidate intervals. Google
// Search Console gets pointed at /sitemap.xml so every public URL
// on Modaire is discoverable — no reliance on internal linking alone.

import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/site";
import { ALL_LANDING_PAGES } from "@/lib/seo/landing-pages";
import { listArticles } from "@/lib/journal";

// How often the sitemap regenerates in seconds. 1 hour is a good
// balance — new listings show up within an hour of publishing without
// hammering the DB on every crawler request.
export const revalidate = 3600;

// Static pages that live outside dynamic templates. Ordered roughly by
// SEO priority so search engines see the important ones first.
const STATIC_ROUTES: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
    { path: "/", priority: 1.0, changeFrequency: "daily" },
    { path: "/browse", priority: 0.9, changeFrequency: "daily" },
    { path: "/journal", priority: 0.7, changeFrequency: "weekly" },
    { path: "/sell", priority: 0.7, changeFrequency: "monthly" },
    { path: "/policies", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/sms-policy", priority: 0.3, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Static entries first — always present regardless of DB state.
    const now = new Date();
    const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
        url: absoluteUrl(r.path),
        lastModified: now,
        changeFrequency: r.changeFrequency,
        priority: r.priority,
    }));

    // Style + category landing pages. Priority slightly below /browse
    // because they're the specific-keyword surfaces (bridal, kaftans,
    // etc.) — high SEO leverage since each targets a distinct query.
    const landingEntries: MetadataRoute.Sitemap = ALL_LANDING_PAGES.map(({ path }) => ({
        url: absoluteUrl(path),
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.85,
    }));

    // Every listing that's currently for sale + moderator-approved.
    // Sold + rejected + pending listings are excluded — no point sending
    // Google to a dead-end page.
    const listings = await prisma.listing.findMany({
        where: {
            status: "AVAILABLE",
            moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
        },
        select: { id: true, updated_at: true },
        orderBy: { updated_at: "desc" },
    });
    const listingEntries: MetadataRoute.Sitemap = listings.map((l) => ({
        url: absoluteUrl(`/listings/${l.id}`),
        lastModified: l.updated_at,
        changeFrequency: "weekly",
        priority: 0.8,
    }));

    // Every seller who has at least one AVAILABLE listing. Empty-shop
    // seller pages are excluded — same rationale as sold listings.
    // Distinct via a raw group-by since Prisma's `distinct` on findMany
    // still returns full rows.
    const activeSellers = await prisma.listing.groupBy({
        by: ["user_id"],
        where: {
            status: "AVAILABLE",
            moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
        },
        _max: { updated_at: true },
    });
    const sellerEntries: MetadataRoute.Sitemap = activeSellers.map((s) => ({
        url: absoluteUrl(`/${s.user_id}`),
        lastModified: s._max.updated_at ?? now,
        changeFrequency: "weekly",
        priority: 0.6,
    }));

    // Journal articles. lastModified prefers updatedAt over publishedAt
    // so re-edits push a fresh crawl signal to Google.
    const articles = await listArticles();
    const journalEntries: MetadataRoute.Sitemap = articles.map((a) => ({
        url: absoluteUrl(`/journal/${a.slug}`),
        lastModified: new Date(a.updatedAt ?? a.publishedAt),
        changeFrequency: "monthly" as const,
        priority: 0.6,
    }));

    return [
        ...staticEntries,
        ...landingEntries,
        ...journalEntries,
        ...listingEntries,
        ...sellerEntries,
    ];
}
