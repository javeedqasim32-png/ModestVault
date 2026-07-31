"use client";

// Write / edit form for the site review. Matches the "Share the love"
// mockup: uppercase eyebrow → serif heading with heart accent →
// warm subtitle → large star row → heart-in-a-line divider → prompt
// with sparkle icon → textarea with counter → "Thank you!" gift
// callout → submit pill. Delete link appears only when editing.

import { useState, useTransition } from "react";
import { Gift, Heart, Sparkles, Star } from "lucide-react";
import { submitSiteReview, deleteMySiteReview } from "@/app/actions/site-reviews";

const MAX_BODY_LENGTH = 500;

export type WriteReviewFormProps = {
    existing: {
        rating: number;
        body: string | null;
    } | null;
};

export default function WriteReviewForm({ existing }: WriteReviewFormProps) {
    const [rating, setRating] = useState<number>(existing?.rating ?? 0);
    const [hoverRating, setHoverRating] = useState<number>(0);
    const [body, setBody] = useState<string>(existing?.body ?? "");
    const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    const activeStars = hoverRating || rating;

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        if (rating < 1) {
            setMessage({ kind: "err", text: "Pick a star rating first." });
            return;
        }
        startTransition(async () => {
            const res = await submitSiteReview({ rating, body });
            if ("success" in res) {
                setMessage({
                    kind: "ok",
                    text: existing ? "Review updated. Thank you." : "Thanks for reviewing Modaire.",
                });
            } else {
                setMessage({ kind: "err", text: res.error });
            }
        });
    }

    function handleDelete() {
        if (!confirm("Delete your review? You can leave a new one anytime.")) return;
        setMessage(null);
        startTransition(async () => {
            const res = await deleteMySiteReview();
            if ("success" in res) {
                setRating(0);
                setBody("");
                setMessage({ kind: "ok", text: "Review deleted." });
            } else {
                setMessage({ kind: "err", text: res.error });
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[#e9ddd2] bg-white p-6 shadow-[0_2px_10px_rgba(114,86,67,0.04)] sm:p-8"
        >
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a7667]">
                {existing ? "Your review" : "Leave a review"}
            </p>
            <h2
                className="mt-2 flex items-center gap-2 text-[24px] font-medium text-[#2f2925] sm:text-[26px]"
                style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
            >
                {existing ? "Update your review" : "Share the love"}
                <Heart className="h-5 w-5 text-[#c99a95]" strokeWidth={1.5} />
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#8a7667]">
                Your review helps others shop with confidence and supports amazing sellers like you.
            </p>

            {/* Star picker. onMouseLeave clears the hover state so
                the preview doesn't stick when the cursor exits. Touch
                devices skip hover — a tap sets `rating` directly. */}
            <div
                className="mt-5 flex items-center gap-1"
                onMouseLeave={() => setHoverRating(0)}
            >
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        aria-label={`${n} star${n === 1 ? "" : "s"}`}
                        onMouseEnter={() => setHoverRating(n)}
                        onClick={() => setRating(n)}
                        disabled={pending}
                        className="p-1 disabled:opacity-50"
                    >
                        <Star
                            className={`h-9 w-9 transition-colors ${
                                n <= activeStars
                                    ? "fill-[#c8a978] text-[#c8a978]"
                                    : "text-[#e2d7cd]"
                            }`}
                            strokeWidth={1.5}
                        />
                    </button>
                ))}
            </div>

            {/* Decorative divider — hairline with a small heart in the
                middle. Pure ornament to match the mockup's warm feel. */}
            <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#efe6dd]" />
                <Heart className="h-4 w-4 text-[#e0c9c4]" strokeWidth={1.5} />
                <div className="h-px flex-1 bg-[#efe6dd]" />
            </div>

            {/* Prompt: icon + heading + subtitle. Icon lives inside a
                small cream circle so it reads as decorative + soft. */}
            <div className="mt-5 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6ecdf]">
                    <Sparkles className="h-4 w-4 text-[#c8a978]" strokeWidth={1.5} />
                </div>
                <div>
                    <p className="text-[15px] font-semibold text-[#2f2925]">
                        What did you love most?
                    </p>
                    <p className="mt-0.5 text-[13px] text-[#8a7667]">
                        The item, the seller, the experience &mdash; we&rsquo;d love to hear it!
                    </p>
                </div>
            </div>

            <div className="mt-4">
                <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={pending}
                    rows={4}
                    maxLength={MAX_BODY_LENGTH}
                    placeholder="Write your review here..."
                    className="block w-full rounded-xl border border-[#ddd3cb] bg-white px-4 py-3 text-[14px] text-[#2f2925] placeholder:text-[#b0a89e] focus:border-[#9a6f3f] focus:outline-none"
                />
                <p className="mt-1 text-right text-[11px] text-[#8a7667]">
                    {body.length} / {MAX_BODY_LENGTH}
                </p>
            </div>

            {/* Thank-you callout box — cream tint, gift icon, warm
                encouragement copy. Sits between textarea and submit
                so it's the last thing the reviewer reads before they
                hit the button. */}
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#f6ecdf] px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
                    <Gift className="h-4 w-4 text-[#a07c61]" strokeWidth={1.5} />
                </div>
                <div>
                    <p className="text-[13px] font-semibold text-[#2f2925]">Thank you!</p>
                    <p className="text-[12px] text-[#8a7667]">
                        Every review you leave helps our community grow.
                    </p>
                </div>
            </div>

            {message ? (
                <div
                    className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                        message.kind === "ok"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-red-200 bg-red-50 text-red-700"
                    }`}
                >
                    {message.text}
                </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-4">
                {existing ? (
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={pending}
                        className="text-[13px] text-[#8a7667] hover:text-[#c04c4c] disabled:opacity-50"
                    >
                        Delete
                    </button>
                ) : null}
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full bg-[#5f4437] px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-[#4a3328] disabled:bg-[#5f4437]/40"
                >
                    {pending ? "Saving..." : existing ? "Update review" : "Submit review"}
                </button>
            </div>
        </form>
    );
}
