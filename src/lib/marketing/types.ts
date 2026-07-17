/**
 * Shared types for the Marketing Executive Team.
 *
 * Platform + status + content_type are stored as plain strings in the DB
 * (deliberately, so new values don't require migrations). String-literal
 * unions here give call sites compile-time protection.
 */

export type MarketingPlatform =
    | "FACEBOOK"
    | "INSTAGRAM_FEED"
    | "INSTAGRAM_STORY"
    | "INSTAGRAM_REEL"
    | "TIKTOK";

export type MarketingContentType =
    | "TEXT"       // caption-only inspiration/community post
    | "IMAGE"      // static image (FB square, IG feed, IG story)
    | "VIDEO";     // Reel / TikTok slideshow (Phase 3)

export type MarketingDraftStatus =
    | "PENDING"    // just generated, awaiting admin decision
    | "APPROVED"   // admin approved; asset + caption ready to post manually
    | "POSTED"     // admin marked as posted on the target platform
    | "REJECTED";  // dropped from queue, kept for audit

// ────────────────────────────────────────────────────────────────────
// Director planning types
// ────────────────────────────────────────────────────────────────────

/**
 * The strategic plan the LLM Director returns per run. One theme, one
 * rationale, a content-mix breakdown, and a list of concrete tasks the
 * specialist agents will execute.
 *
 * Keep the shape stable — CopyAgent + ImageAgent + VideoAgent all
 * consume tasks[] and any changes here ripple through them.
 */
export type MarketingPlan = {
    /** ONE strategic bet for the day. Not a to-do list — the north star. */
    theme: string;
    /** Director's reasoning — why this theme, what intel drove it. */
    rationale: string;
    /** Planned per-platform post counts + pillar ratios. */
    contentMix: {
        totalPosts: number;
        byPillar?: {
            product?: number;
            inspiration?: number;
            community?: number;
        };
    };
    /** Individual pieces of work handed to specialist agents. */
    tasks: MarketingTask[];
};

/**
 * Visual mood presets — Director picks one per VIDEO task. Controls
 * lighting, warmth, and overall atmospheric feel. Curated enum (not
 * free-text) so bad LLM improvisation can't produce off-brand results.
 */
export type VideoVisualMood =
    | "warm-golden"       // Golden hour side light. Bridal / evening / formal.
    | "soft-morning"      // Airy natural daylight. Everyday / casual / wedding-guest.
    | "studio-bright"     // Clean white studio lighting. Sale posts / product-first.
    | "dramatic-low-key"  // Moody shadows, cinematic contrast. Statement / luxury.
    | "festive-vibrant";  // Warm celebratory ambient. Eid / cultural / weddings.

/**
 * Camera motion presets — Director picks one per VIDEO task. Controls
 * how the camera moves through the clip.
 */
export type VideoCameraMotion =
    | "slow-push"      // Slow cinematic zoom-in. Default, contemplative.
    | "orbit"          // Camera rotates around subject. Full-outfit reveal.
    | "reveal"         // Detail pull-out (fabric drape, embroidery close-up).
    | "handheld-sway"  // Subtle organic movement. Editorial feel.
    | "static-hold";   // No camera movement, subject/fabric moves alone.

/**
 * The unit of work handed from the Director to a specialist agent.
 * One task = one MarketingDraft that will land in the queue.
 */
export type MarketingTask = {
    platform: MarketingPlatform;
    contentType: MarketingContentType;
    /** Which listing this post spotlights. Optional — a pure inspiration
     *  or community post may have no listing tied to it. */
    listingId?: string;
    /** The single sharpest opener the copy should lead with. Director-
     *  chosen so multiple posts in a run stay coordinated. For VIDEO
     *  tasks, this becomes the Runway prompt's subject + action. */
    hook: string;
    /** Strategic framing carried through the whole coordinated push,
     *  e.g. "wedding-season affordable" or "quiet-luxury edit." */
    angle: string;
    /** Which content pillar this post serves — used by the CopyAgent
     *  to tune tone. */
    pillar?: "product" | "inspiration" | "community";
    /** Priority 1 (highest) → 3 (lowest). Director sets; useful if we
     *  ever hit a budget/rate limit and need to trim. */
    priority?: 1 | 2 | 3;
    // ── VIDEO-specific creative dimensions (ignored for IMAGE tasks) ──
    /** Lighting + atmosphere preset for VIDEO. Defaults to soft-morning
     *  if omitted. See VideoVisualMood for when to pick which. */
    visualMood?: VideoVisualMood;
    /** Camera movement preset for VIDEO. Defaults to slow-push if
     *  omitted. See VideoCameraMotion. */
    cameraMotion?: VideoCameraMotion;
    /** Free-text ambient description the Director may add to the video
     *  (e.g. "silk shifting in a gentle breeze", "petals falling").
     *  Kept short (<80 chars) to avoid overloading the Runway prompt. */
    settingAtmosphere?: string;
    /** Video length in seconds. Runway Gen-4 Turbo supports 5 or 10.
     *  Defaults to 10 (better for retention). Director may drop to 5
     *  for simple sale-price flashes or credit conservation. */
    videoDurationSec?: 5 | 10;
};

// ────────────────────────────────────────────────────────────────────
// Agent output types
// ────────────────────────────────────────────────────────────────────

/**
 * What ImageAgent returns after compositing.
 */
export type GeneratedImage = {
    s3Url: string;
    widthPx: number;
    heightPx: number;
};

/**
 * What CopyAgent returns.
 */
export type GeneratedCopy = {
    caption: string;
    hashtags: string;
};

// ────────────────────────────────────────────────────────────────────
// Intelligence types — inputs to the Director's LLM call
// ────────────────────────────────────────────────────────────────────

/**
 * Summary of the marketplace's business state from the last 24-72
 * hours. Fed to the Director so it can reason about what today should
 * accomplish given real conditions.
 */
export type BusinessIntel = {
    period: { fromIso: string; toIso: string };
    salesLast24h: {
        purchaseCount: number;
        grossRevenueUsd: number;
    };
    cart: {
        currentActiveCarts: number;
        addedLast24h: number;
    };
    inventory: {
        totalAvailable: number;
        featuredCount: number;
        onSaleCount: number;
        newInLast7Days: number;
        unsoldOver30Days: number;
    };
    signups: {
        newUsersLast24h: number;
        newUsersLast7Days: number;
    };
    topListings: {
        mostViewed7d: Array<{ id: string; title: string; category: string; price: number; viewCount: number }>;
        mostFavorited7d: Array<{ id: string; title: string; category: string; price: number; favoriteCount: number }>;
    };
    activePromotion?: {
        name: string;
        discountPercent: number;
        endsAtIso: string;
        daysUntilEnd: number;
    };
};

/**
 * Calendar-based context: what cultural/seasonal/promo events are
 * relevant right now across four lead-time windows so the Director
 * can think ahead (Eid in 18 days needs anticipation content, not a
 * day-of announcement).
 */
export type CalendarEventKind = "cultural" | "seasonal" | "holiday" | "promo" | "shopping";

export type CalendarEvent = {
    slug: string;
    name: string;
    kind: CalendarEventKind;
    startsAt: string;          // ISO date
    endsAt: string;            // ISO date (== startsAt for single-day)
    leadTimeDays: number;      // start building content this many days out
    audienceRelevance: "high" | "medium" | "low";
    strategyHint: string;      // one-line guidance for the Director
};

export type CalendarHorizon = {
    today: string;             // ISO date
    activeToday: Array<CalendarEvent & { daysIntoEvent: number }>;
    imminent: Array<CalendarEvent & { daysUntilStart: number }>;      // 1-7 days out
    building: Array<CalendarEvent & { daysUntilStart: number }>;      // 8-30 days out
    recentlyEnded: Array<CalendarEvent & { daysSinceEnd: number }>;   // 0-7 days past
};
