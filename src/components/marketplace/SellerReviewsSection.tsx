"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { upsertSellerReview } from "@/app/actions/seller-reviews";
import { createPortal } from "react-dom";

export type SellerReviewItem = {
  id: string;
  sellerId: string;
  reviewerName: string;
  rating: number;
  text: string;
  dateLabel: string;
};

function ratingStars(rating: number) {
  return "★".repeat(Math.max(0, Math.min(5, rating))) + "☆".repeat(Math.max(0, 5 - rating));
}

export default function SellerReviewsSection({
  sellerId,
  sellerName = "this seller",
  initialReviews = [],
  canWrite = false,
}: {
  sellerId: string;
  sellerName?: string;
  initialReviews?: SellerReviewItem[];
  canWrite?: boolean;
}) {
  const [reviews, setReviews] = useState<SellerReviewItem[]>(initialReviews);
  const [showComposer, setShowComposer] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedReviews = useMemo(() => reviews, [reviews]);

  function resetComposer() {
    setRating(0);
    setText("");
    setError(null);
  }

  function openComposer() {
    resetComposer();
    setShowComposer(true);
  }

  function closeComposer() {
    setShowComposer(false);
    resetComposer();
  }

  useEffect(() => {
    if (!showComposer) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [showComposer]);

  function submitReview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await upsertSellerReview({ sellerId, rating, text });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      if (!("ok" in result) || !result.ok || !result.review) {
        setError("Unable to submit review. Please try again.");
        return;
      }

      const submittedReview = result.review;
      const next = [submittedReview, ...reviews.filter((item) => item.id !== submittedReview.id)];
      setReviews(next);
      closeComposer();
    });
  }

  return (
    <section className="px-4 pb-8 pt-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[23px] font-medium leading-[1.05] text-foreground" style={{ fontFamily: "var(--font-serif), serif" }}>
          Reviews
        </h2>
        {canWrite ? (
          <button
            type="button"
            onClick={openComposer}
            className="text-[12px] font-normal text-[#8a7667] transition-colors hover:text-[#6f5848]"
          >
            + Write Review
          </button>
        ) : (
          <span className="text-[12px] text-[#8a7667]">Sign in to review</span>
        )}
      </div>

      {showComposer && canWrite && typeof window !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1200] flex items-center justify-center bg-[#2f2925]/48 p-4 sm:p-6"
              onClick={() => {
                if (!isPending) closeComposer();
              }}
            >
              <form
                onSubmit={submitReview}
                onClick={(e) => e.stopPropagation()}
                className="flex w-full max-w-[760px] flex-col overflow-hidden rounded-[30px] border border-[#d7cdc4] bg-[#f8f4ef] shadow-[0_26px_52px_rgba(33,27,23,0.26)]"
                style={{ maxHeight: "min(80vh, 760px)" }}
              >
                <div className="overflow-y-auto px-5 pb-4 pt-6 sm:px-6 sm:pt-7">
                  <h3
                    className="text-[22px] font-medium leading-[1.05] text-[#2f2925]"
                    style={{ fontFamily: "'Cormorant Garamond', var(--font-serif), serif", fontWeight: 500 }}
                  >
                    Leave a Review
                  </h3>
                  <p className="mt-2 text-[13px] text-[#8a7667]" style={{ fontFamily: "'Jost', var(--font-sans), sans-serif" }}>
                    Share your experience with <span className="font-semibold text-[#2f2925]">{sellerName}</span>.
                  </p>

                  <label className="mt-6 block text-[12px] font-medium uppercase tracking-[0.14em] text-[#8a7667]" style={{ fontFamily: "'Jost', var(--font-sans), sans-serif" }}>
                    Rating
                  </label>
                  <div className="mt-3 flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRating(value)}
                        className="rounded-full p-1 text-[#c4c4c4] transition-colors hover:text-[#8a7667]"
                        aria-label={`Set rating to ${value}`}
                      >
                        <Star
                          className="h-9 w-9"
                          strokeWidth={1.7}
                          fill={value <= rating ? "#8a7667" : "transparent"}
                          color={value <= rating ? "#8a7667" : "#c4c4c4"}
                        />
                      </button>
                    ))}
                  </div>

                  <label
                    htmlFor="seller-review-text"
                    className="mt-6 block text-[12px] font-medium uppercase tracking-[0.14em] text-[#8a7667]"
                    style={{ fontFamily: "'Jost', var(--font-sans), sans-serif" }}
                  >
                    Your Review
                  </label>
                  <textarea
                    id="seller-review-text"
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 300))}
                    rows={4}
                    placeholder="Describe your experience - item quality, packaging, communication..."
                    className="mt-3 w-full resize-none rounded-[18px] border border-[#d7cdc4] bg-[#fbf8f5] px-4 py-4 text-[13px] leading-[1.45] text-[#2f2925] outline-none placeholder:text-[#b6ada5]"
                    style={{ fontFamily: "'Jost', var(--font-sans), sans-serif" }}
                  />
                  <div className="mt-2 text-right text-[12px] text-[#b0a89e]" style={{ fontFamily: "'Jost', var(--font-sans), sans-serif" }}>
                    {text.length}/300
                  </div>
                  {error ? <p className="mt-1 text-[12px] text-[#a34141]">{error}</p> : null}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-[#e6ddd5] px-5 py-4 sm:px-6 sm:py-5">
                  <button
                    type="button"
                    onClick={closeComposer}
                    className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-[#d7cdc4] bg-[#fbf8f5] px-4 text-[14px] font-medium text-[#2f2925]"
                    style={{ fontFamily: "'Jost', var(--font-sans), sans-serif" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || rating < 1}
                    className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-[#a77b5b] bg-[#a77b5b] px-4 text-[14px] font-medium text-white disabled:opacity-70"
                    style={{ fontFamily: "'Jost', var(--font-sans), sans-serif" }}
                  >
                    {isPending ? "Submitting..." : "Submit Review"}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}

      {sortedReviews.length === 0 ? (
        <div className="rounded-[12px] border border-[#ddd3cb] bg-[#fbf8f5] px-4 py-5 text-[13px] text-[#8a7667]">
          No reviews yet.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReviews.map((review) => (
            <div key={review.id} className="rounded-[12px] border border-[#ddd3cb] bg-[#fbf8f5] px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ddd3cb] bg-[#efe7de] text-[18px] font-semibold text-[#8a7667]">
                    {(review.reviewerName?.[0] || "R").toUpperCase()}
                  </div>
                  <p className="text-[15px] font-semibold text-[#2f2925]">
                    {review.reviewerName} <span className="ml-1 text-[15px] font-normal tracking-tight">{ratingStars(review.rating)}</span>
                  </p>
                </div>
                <span className="text-[12px] text-[#8a7667]">{review.dateLabel}</span>
              </div>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#8a7667]">{review.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
