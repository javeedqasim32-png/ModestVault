// Public reviews page — /reviews. Redesigned to match the "Loved by
// Our Community" layout: hero rating block, write-review card,
// stats row (overall rating card + distribution histogram), sorted
// review list with an empty-state CTA.
//
// Emits Review + AggregateRating JSON-LD once we have at least one
// published review (see AGGREGATE_MIN_COUNT gate) so Google can
// potentially render star ratings in the SERP.

import Link from "next/link";
import { MessageCircle, Star } from "lucide-react";
import localFont from "next/font/local";
import { auth } from "@/auth";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { SITE_CONFIG, absoluteUrl } from "@/lib/seo/site";
import {
    getReviewAggregate,
    getPublishedReviews,
    getMySiteReview,
    parseReviewSort,
    AGGREGATE_MIN_COUNT,
    type ReviewSort,
} from "@/lib/site-reviews";
import WriteReviewForm from "./WriteReviewForm";

export const revalidate = 300;

// Local Cormorant instance mirrors what the homepage + landing pages
// use so the "Loved by Our Community" heading matches the site's
// editorial voice.
const cormorantHeading = localFont({
    src: [
        { path: "../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
        { path: "../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
    ],
    display: "swap",
});

export const metadata = buildPageMetadata({
    title: "Reviews",
    description:
        "Real reviews from Modaire buyers and sellers. See what the community says about our modest fashion marketplace — preloved abayas, kaftans, hijabs, and Pakistani bridal wear.",
    path: "/reviews",
});

// Presentational bits ─────────────────────────────────────────────────

function StarRow({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) {
    return (
        <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    className={`${size} ${
                        n <= rating
                            ? "fill-[#c8a978] text-[#c8a978]"
                            : "text-[#e2d7cd]"
                    }`}
                />
            ))}
        </div>
    );
}

function formatRelativeDate(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days < 1) return "today";
    if (days < 2) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? "" : "s"} ago`;
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Page ────────────────────────────────────────────────────────────────

export default async function ReviewsPage({
    searchParams,
}: {
    searchParams: Promise<{ sort?: string }>;
}) {
    const { sort: sortRaw } = await searchParams;
    const sort: ReviewSort = parseReviewSort(sortRaw);
    const session = await auth();
    const [aggregate, reviews, myReview] = await Promise.all([
        getReviewAggregate(),
        getPublishedReviews({ take: 50, sort }),
        getMySiteReview(session?.user?.id),
    ]);

    const hasReviews = aggregate.count > 0;
    const showSchema = aggregate.count >= AGGREGATE_MIN_COUNT;

    // Histogram max — used to normalize bar widths so the biggest
    // bucket fills the row. Guards against a divide-by-zero on empty.
    const maxBucket = Math.max(
        aggregate.distribution[1],
        aggregate.distribution[2],
        aggregate.distribution[3],
        aggregate.distribution[4],
        aggregate.distribution[5],
        1,
    );

    return (
        <>
            <JsonLd
                data={breadcrumbJsonLd([
                    { name: "Home", path: "/" },
                    { name: "Reviews", path: "/reviews" },
                ])}
            />
            {showSchema ? (
                <JsonLd
                    data={{
                        "@context": "https://schema.org",
                        "@type": "Organization",
                        name: SITE_CONFIG.name,
                        url: absoluteUrl("/"),
                        aggregateRating: {
                            "@type": "AggregateRating",
                            ratingValue: aggregate.average,
                            reviewCount: aggregate.count,
                            bestRating: 5,
                            worstRating: 1,
                        },
                    }}
                />
            ) : null}
            {showSchema && reviews.length > 0 ? (
                <JsonLd
                    data={reviews.map((r) => ({
                        "@context": "https://schema.org",
                        "@type": "Review",
                        itemReviewed: {
                            "@type": "Organization",
                            name: SITE_CONFIG.name,
                            url: absoluteUrl("/"),
                        },
                        reviewRating: {
                            "@type": "Rating",
                            ratingValue: r.rating,
                            bestRating: 5,
                            worstRating: 1,
                        },
                        author: { "@type": "Person", name: r.displayName },
                        datePublished: r.createdAt.toISOString(),
                        ...(r.body ? { reviewBody: r.body } : {}),
                    }))}
                />
            ) : null}

            <div className="min-h-screen bg-[#f6f1e8] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
                <div className="mx-auto w-full max-w-3xl space-y-8">
                    {/* Hero. Rating shown even on 1 review — copy is
                        transparent about the sample size. */}
                    <header className="flex flex-col items-center text-center">
                        {/* Explicit indent-left equal to the letter-spacing
                            so the wide-tracked "COMMUNITY" text is visually
                            centered — otherwise the trailing 0.24em after
                            the last Y shifts the whole word left of center. */}
                        <p
                            className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a7667]"
                            style={{ paddingLeft: "0.24em" }}
                        >
                            Community
                        </p>
                        <h1 className={`${cormorantHeading.className} mt-3 text-[30px] font-medium leading-[1.1] text-[#2f2925] sm:text-[42px]`}>
                            Loved by Our Community
                        </h1>
                        {/* Two lines with explicit break so the copy
                            matches the mockup regardless of viewport. */}
                        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#8a7667]">
                            Real stories. Trusted styles.
                            <br />
                            Thank you for being part of the Modaire family.
                        </p>

                        {hasReviews ? (
                            <div className="mt-6 flex flex-col items-center gap-1">
                                <div className="flex items-center gap-3">
                                    <StarRow rating={Math.round(aggregate.average)} size="h-6 w-6" />
                                    <span className="text-[28px] font-semibold text-[#2f2925]">
                                        {aggregate.average.toFixed(1)}
                                    </span>
                                </div>
                                <p className="mt-1 text-[13px] text-[#5f4a3c]">
                                    {aggregate.count} {aggregate.count === 1 ? "Review" : "Reviews"}
                                </p>
                                {aggregate.recommendPercent > 0 ? (
                                    <p className="text-[12px] text-[#8a7667]">
                                        {aggregate.recommendPercent}% recommend Modaire
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                    </header>

                    {/* Write / edit form (signed-in only) OR sign-in
                        prompt. Anchor id is the jump target for the
                        "Be the first to review" empty-state CTA below. */}
                    <div id="leave-a-review" className="scroll-mt-24">
                        {session?.user?.id ? (
                            <WriteReviewForm
                                existing={
                                    myReview
                                        ? { rating: myReview.rating, body: myReview.body ?? null }
                                        : null
                                }
                            />
                        ) : (
                            <div className="rounded-2xl border border-[#e9ddd2] bg-white px-6 py-8 text-center shadow-[0_2px_10px_rgba(114,86,67,0.04)]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a7667]">
                                    Leave a review
                                </p>
                                <h2 className={`${cormorantHeading.className} mt-2 text-[24px] font-medium text-[#2f2925]`}>
                                    Share your Modaire experience
                                </h2>
                                <p className="mt-3 text-sm text-[#8a7667]">
                                    <Link href="/login?callbackUrl=/reviews" className="font-medium text-[#5f4437] underline underline-offset-4 hover:text-[#4a3328]">
                                        Sign in
                                    </Link>{" "}
                                    to leave a review.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Rating distribution — full width. Only rendered
                        when we have reviews (empty histogram is
                        uninteresting). Overall rating card was removed
                        because the hero already shows that summary. */}
                    {hasReviews ? (
                        <div className="rounded-2xl border border-[#e9ddd2] bg-white p-5 shadow-[0_2px_10px_rgba(114,86,67,0.04)]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7667]">
                                Rating breakdown
                            </p>
                            <div className="mt-3 space-y-2">
                                {([5, 4, 3, 2, 1] as const).map((star) => {
                                    const count = aggregate.distribution[star];
                                    const pct = aggregate.count > 0
                                        ? Math.round((count / aggregate.count) * 100)
                                        : 0;
                                    const barWidth = Math.round((count / maxBucket) * 100);
                                    return (
                                        <div key={star} className="flex items-center gap-3 text-[13px]">
                                            <span className="flex w-6 items-center gap-0.5 text-[#5f4a3c]">
                                                {star}
                                                <Star className="h-3 w-3 fill-[#c8a978] text-[#c8a978]" />
                                            </span>
                                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#efe1d0]">
                                                <div
                                                    className="h-full rounded-full bg-[#8a6e57]"
                                                    style={{ width: `${barWidth}%` }}
                                                />
                                            </div>
                                            <span className="w-10 text-right text-[12px] text-[#8a7667]">
                                                {pct}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    {/* Review list header + sort pills. Server-component
                        friendly — each option is a plain link that
                        re-renders the page with a new ?sort query
                        param. No client-side JS needed. */}
                    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                        <h2 className={`${cormorantHeading.className} text-[22px] font-medium text-[#2f2925]`}>
                            Verified Reviews
                        </h2>
                        {hasReviews ? (
                            <div className="flex items-center gap-1 rounded-full border border-[#e9ddd2] bg-white p-1 text-[12px]">
                                {(
                                    [
                                        { key: "recent" as const, label: "Most recent" },
                                        { key: "highest" as const, label: "Highest" },
                                        { key: "lowest" as const, label: "Lowest" },
                                    ]
                                ).map((opt) => {
                                    const active = sort === opt.key;
                                    return (
                                        <Link
                                            key={opt.key}
                                            href={`/reviews?sort=${opt.key}`}
                                            scroll={false}
                                            className={`rounded-full px-3 py-1 transition-colors ${
                                                active
                                                    ? "bg-[#5f4437] text-white"
                                                    : "text-[#8a7667] hover:text-[#2f2925]"
                                            }`}
                                        >
                                            {opt.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    {/* Review list OR empty state. Stacked vertically
                        and center-aligned so everything reads as one
                        coherent block regardless of viewport. */}
                    {reviews.length === 0 ? (
                        <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#e9ddd2] bg-white px-6 py-10 text-center shadow-[0_2px_10px_rgba(114,86,67,0.04)]">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f2ebe4]">
                                <MessageCircle className="h-5 w-5 text-[#8a7667]" />
                            </div>
                            <div className="max-w-md">
                                <p className="font-semibold text-[#2f2925]">No reviews yet</p>
                                <p className="mt-1 text-[13px] text-[#8a7667]">
                                    Help the community by sharing your experience. Your review helps other buyers and sellers shop with confidence.
                                </p>
                            </div>
                            {session?.user?.id ? (
                                <a
                                    href="#leave-a-review"
                                    className="inline-flex items-center rounded-full bg-[#5f4437] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4a3328]"
                                >
                                    Be the first to review
                                </a>
                            ) : (
                                <Link
                                    href="/login?callbackUrl=/reviews"
                                    className="inline-flex items-center rounded-full bg-[#5f4437] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4a3328]"
                                >
                                    Be the first to review
                                </Link>
                            )}
                        </div>
                    ) : (
                        <ul className="space-y-4">
                            {reviews.map((r) => (
                                <li
                                    key={r.id}
                                    className="rounded-2xl border border-[#e9ddd2] bg-white p-5 shadow-[0_2px_10px_rgba(114,86,67,0.04)]"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-[#2f2925]">
                                                {r.displayName}
                                            </p>
                                            <div className="mt-1 flex items-center gap-2">
                                                <StarRow rating={r.rating} />
                                                <span className="text-[12px] text-[#8a7667]">
                                                    · {formatRelativeDate(r.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {r.body ? (
                                        <p className="mt-3 text-[14px] leading-relaxed text-[#5f4a3c]">
                                            {r.body}
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </>
    );
}
