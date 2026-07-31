// Read-side helpers for the site-review system. Server-side only.
// Write flows (submit/delete/hide/unhide) live in the server-action
// module at src/app/actions/site-reviews.ts. Kept split so any server
// component that just needs to READ the aggregate or list reviews can
// skip pulling in the auth/admin logic the write actions require.

import { prisma } from "@/lib/prisma";

export type PublishedReview = {
    id: string;
    rating: number;
    body: string | null;
    createdAt: Date;
    displayName: string;   // "Sarah H." — first + last initial for privacy
};

export type ReviewAggregate = {
    count: number;
    average: number;   // 1 decimal place, rounded
    /** Percent of reviews with rating >= 4. Used as a "would recommend"
     *  proxy on the reviews page hero. Integer 0-100. */
    recommendPercent: number;
    /** Count of reviews at each star level, keyed 1-5. Powers the
     *  histogram card on the reviews page. */
    distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
};

export type ReviewSort = "recent" | "highest" | "lowest";

/**
 * Parse the sort URL param safely. Falls back to "recent" for unknown
 * values so a bad ?sort=xyz doesn't 500 the page.
 */
export function parseReviewSort(input: unknown): ReviewSort {
    if (input === "highest" || input === "lowest") return input;
    return "recent";
}

/**
 * Threshold below which we don't show a homepage rating widget or emit
 * AggregateRating JSON-LD. Set to 1 so social proof activates from the
 * very first review — the reviews page always renders the "Based on X
 * review" copy, which is transparent about the sample size. If a
 * shaky early rating becomes a concern, bump to 3 or 5 without any
 * downstream changes needed.
 */
export const AGGREGATE_MIN_COUNT = 1;

/**
 * Full aggregate across all PUBLISHED reviews: count, average, %
 * recommend, per-star distribution. Powered by two queries — one
 * scalar aggregate + one groupBy for the histogram. Cheap enough to
 * call on every page render; downstream pages can revalidate to
 * amortize cost across visitors.
 */
export async function getReviewAggregate(): Promise<ReviewAggregate> {
    const [agg, byRating] = await Promise.all([
        (prisma as any).siteReview.aggregate({
            where: { status: "PUBLISHED" },
            _count: { _all: true },
            _avg: { rating: true },
        }),
        (prisma as any).siteReview.groupBy({
            by: ["rating"],
            where: { status: "PUBLISHED" },
            _count: { rating: true },
        }),
    ]);

    const count = agg._count?._all ?? 0;
    const avgRaw = agg._avg?.rating ?? 0;

    // Seed distribution buckets so downstream renders always have a
    // number to render for each star level even when nothing matches.
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let recommendCount = 0;
    for (const row of byRating as Array<{ rating: number; _count: { rating: number } }>) {
        const r = row.rating as 1 | 2 | 3 | 4 | 5;
        if (r >= 1 && r <= 5) {
            distribution[r] = row._count.rating;
            if (r >= 4) recommendCount += row._count.rating;
        }
    }

    return {
        count,
        average: count > 0 ? Math.round(avgRaw * 10) / 10 : 0,
        recommendPercent: count > 0 ? Math.round((recommendCount / count) * 100) : 0,
        distribution,
    };
}

/**
 * Page-size list of PUBLISHED reviews for the /reviews page. Names
 * are anonymized to "First L." for privacy — full last names never
 * leave the server. `body` may be null (rating-only reviews are valid).
 *
 * Sort options:
 *   - recent  (default) — newest first
 *   - highest           — rating desc, then newest
 *   - lowest            — rating asc, then newest
 */
export async function getPublishedReviews(opts: {
    take?: number;
    skip?: number;
    sort?: ReviewSort;
} = {}): Promise<PublishedReview[]> {
    const take = Math.min(Math.max(opts.take ?? 20, 1), 100);
    const skip = Math.max(opts.skip ?? 0, 0);
    const sort: ReviewSort = opts.sort ?? "recent";
    const orderBy =
        sort === "highest" ? [{ rating: "desc" }, { created_at: "desc" }] :
        sort === "lowest"  ? [{ rating: "asc"  }, { created_at: "desc" }] :
                             [{ created_at: "desc" }];
    const rows = await (prisma as any).siteReview.findMany({
        where: { status: "PUBLISHED" },
        orderBy,
        take,
        skip,
        include: {
            user: {
                select: {
                    first_name: true,
                    last_name: true,
                },
            },
        },
    });
    return rows.map((row: any) => ({
        id: row.id,
        rating: row.rating,
        body: row.body,
        createdAt: row.created_at,
        displayName: formatDisplayName(row.user?.first_name, row.user?.last_name),
    }));
}

/**
 * "Sarah Habib" → "Sarah H." — first name in full, last name reduced
 * to its initial. If either half is missing, fall back to whatever we
 * have; a totally-empty name becomes "Anonymous".
 */
function formatDisplayName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
): string {
    const first = (firstName ?? "").trim();
    const lastInitial = (lastName ?? "").trim().charAt(0);
    if (first && lastInitial) return `${first} ${lastInitial.toUpperCase()}.`;
    if (first) return first;
    return "Anonymous";
}

/**
 * The current user's own review, if any. Used by the write form on
 * /reviews and the dashboard tile so we can show "Your review: ⭐⭐⭐⭐⭐"
 * vs "Rate Modaire". Returns null when signed out or no review yet.
 */
export async function getMySiteReview(userId: string | null | undefined) {
    if (!userId) return null;
    return (prisma as any).siteReview.findUnique({
        where: { user_id: userId },
    });
}
