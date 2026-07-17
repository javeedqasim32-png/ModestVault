import { randomUUID } from "crypto";
import { uploadFile, getS3BucketName, buildS3ImageUrl } from "@/lib/s3";
import type { MarketingPlatform } from "../types";

/**
 * VideoAgent — generates a vertical 9:16 slideshow video from listing
 * photos using the Shotstack API. Output: MP4 uploaded to S3.
 *
 * Design: Ken Burns pans across each product photo, cross-fade
 * transitions, a hook headline animated on the opening frame, price
 * on the closing frame, gentle royalty-free music.
 *
 * This is the piece that actually drives virality — static images
 * rarely get shared, videos do. Static ImageAgent output is a
 * supplement.
 *
 * Shotstack signup: https://dashboard.shotstack.io/register
 *   Free tier: 100 render minutes/month (~60-90 short clips)
 *   Set SHOTSTACK_API_KEY in .env (use the STAGING key for testing,
 *   PRODUCTION key when going live — pricing tiers differ).
 *
 * Uses direct fetch (no SDK) — matching the pattern used elsewhere
 * in this repo (see src/lib/marketing/agents/copy.ts).
 */

type GeneratedVideo = {
    s3Url: string;
    widthPx: number;
    heightPx: number;
    durationSec: number;
};

// All video output is Story format for the same reason ImageAgent is:
// works as IG Reel, IG Story, TikTok, FB Story upload.
const VIDEO_SPEC = {
    widthPx: 1080,
    heightPx: 1920,
    aspectRatio: "9:16" as const,
    resolution: "hd" as const,
};

/** Shotstack Edit API base — staging vs. production tiers. */
const SHOTSTACK_BASE = process.env.SHOTSTACK_ENV === "production"
    ? "https://api.shotstack.io/edit/v1"
    : "https://api.shotstack.io/edit/stage";

// Per-clip duration for Ken Burns pans (seconds). 3s each × 4 clips
// = 12s video + intro/outro title cards → ~14s total. Right in the
// TikTok/Reels sweet spot (<20s outperforms longer per Meta's own
// internal data — leaning on the "Reels < 20s" learning here).
const CLIP_DURATION = 3;
const TITLE_DURATION = 2.5;

export async function generateVideo(input: {
    platform: MarketingPlatform;
    listing: {
        id: string;
        title: string;
        price: number;
        photoUrls: string[]; // 3-8 URLs of listing photos (S3 or absolute)
    };
    /** Director-provided visual hook — becomes the opening title card. */
    hook?: string;
    /** Optional: pin a specific Shotstack music track. Otherwise uses
     *  a soft default from Shotstack's library. */
    soundtrackUrl?: string;
}): Promise<GeneratedVideo> {
    const apiKey = process.env.SHOTSTACK_API_KEY;
    if (!apiKey) {
        throw new Error(
            "SHOTSTACK_API_KEY is required for VideoAgent. Sign up at https://dashboard.shotstack.io/register",
        );
    }

    // 1. Build the Shotstack timeline JSON.
    const timeline = buildSlideshowTimeline({
        photoUrls: input.listing.photoUrls.slice(0, 6),
        headline: input.hook || input.listing.title,
        price: `$${input.listing.price.toFixed(2)}`,
        soundtrackUrl: input.soundtrackUrl,
    });

    // 2. Submit render job.
    const renderRes = await fetch(`${SHOTSTACK_BASE}/render`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
        },
        body: JSON.stringify({
            timeline,
            output: {
                format: "mp4",
                resolution: VIDEO_SPEC.resolution,
                aspectRatio: VIDEO_SPEC.aspectRatio,
                fps: 30,
            },
        }),
    });
    if (!renderRes.ok) {
        const body = await renderRes.text().catch(() => "<no body>");
        throw new Error(`Shotstack render submit failed ${renderRes.status}: ${body.slice(0, 300)}`);
    }
    const renderData = await renderRes.json();
    const renderId: string = renderData?.response?.id;
    if (!renderId) throw new Error("Shotstack render returned no id");

    // 3. Poll for completion. Typical render: 15-45 seconds for a
    //    12-15s video. Cap at 3 minutes to avoid hanging the Director.
    const completedAt = await pollShotstackUntilDone({
        apiKey,
        renderId,
        maxWaitMs: 3 * 60 * 1000,
    });
    if (!completedAt.url) {
        throw new Error(`Shotstack render finished with no URL: ${JSON.stringify(completedAt)}`);
    }

    // 4. Download the finished MP4 from Shotstack's CDN and re-upload
    //    to our S3. Shotstack's own URLs expire, and mirroring to S3
    //    keeps assets under our control + inside our CDN.
    const mp4Res = await fetch(completedAt.url);
    if (!mp4Res.ok) throw new Error(`Fetching Shotstack MP4 failed ${mp4Res.status}`);
    const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());

    const bucket = getS3BucketName();
    const key = `marketing/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.mp4`;
    await uploadFile(mp4Buffer, key, "video/mp4", bucket);
    const s3Url = buildS3ImageUrl(key, bucket);

    return {
        s3Url,
        widthPx: VIDEO_SPEC.widthPx,
        heightPx: VIDEO_SPEC.heightPx,
        durationSec: TITLE_DURATION + input.listing.photoUrls.slice(0, 6).length * CLIP_DURATION + TITLE_DURATION,
    };
}

// ────────────────────────────────────────────────────────────────────
// Shotstack timeline builder
// ────────────────────────────────────────────────────────────────────

/**
 * Timeline layout:
 *   [ opening title card ] → [ photo 1 KB pan ] → ... → [ photo N ] → [ closing title with price ]
 *   soundtrack: royalty-free ambient bed, fade in/out
 */
function buildSlideshowTimeline(input: {
    photoUrls: string[];
    headline: string;
    price: string;
    soundtrackUrl?: string;
}) {
    const photoCount = input.photoUrls.length;
    if (photoCount === 0) {
        throw new Error("VideoAgent needs at least one photo");
    }

    // KB pans alternate zoom direction each clip — feels less
    // mechanical than "everything zooms in."
    const photoClips = input.photoUrls.map((url, i) => {
        const zoomEffect = i % 2 === 0 ? "zoomIn" : "zoomOut";
        return {
            asset: { type: "image", src: url },
            start: TITLE_DURATION + i * CLIP_DURATION,
            length: CLIP_DURATION,
            effect: zoomEffect,
            transition: {
                in: i === 0 ? "fade" : "fadeSlow",
                out: "fadeSlow",
            },
            fit: "cover",
        };
    });

    // Opening title — animated hook on a dark background.
    const openingTitle = {
        asset: {
            type: "title",
            text: input.headline.toUpperCase(),
            style: "future",
            color: "#ffffff",
            size: "large",
            position: "center",
        },
        start: 0,
        length: TITLE_DURATION,
        effect: "zoomIn",
        transition: { in: "fade", out: "fadeSlow" },
    };

    // Closing title — the price.
    const closingTitleStart = TITLE_DURATION + photoCount * CLIP_DURATION;
    const closingTitle = {
        asset: {
            type: "title",
            text: `${input.price}  ·  Shop at shopmodaire.com`,
            style: "minimal",
            color: "#ffffff",
            size: "medium",
            position: "center",
        },
        start: closingTitleStart,
        length: TITLE_DURATION,
        effect: "zoomIn",
        transition: { in: "fadeSlow", out: "fade" },
    };

    // Persistent Modaire wordmark overlay in the top-left throughout
    // the video — brand always visible.
    const totalDuration = closingTitleStart + TITLE_DURATION;
    const brandOverlay = {
        asset: {
            type: "title",
            text: "MODAIRE",
            style: "chunk",
            color: "#ffffff",
            size: "x-small",
            position: "topLeft",
            offset: { x: -0.4, y: 0.42 },
        },
        start: 0,
        length: totalDuration,
    };

    const tracks: Array<{ clips: unknown[] }> = [
        // Track 0: photos + title cards (rendered bottom-to-top → photos below titles)
        { clips: [openingTitle, ...photoClips, closingTitle] },
        // Track 1: persistent brand overlay
        { clips: [brandOverlay] },
    ];

    // Soundtrack is opt-in. Shotstack's default CDN URLs are
    // unreliable on the sandbox tier — many resolve to dead
    // domains. Videos render silent unless the caller passes a
    // real, publicly-fetchable audio URL.
    const timeline: {
        background: string;
        tracks: Array<{ clips: unknown[] }>;
        soundtrack?: { src: string; effect: string; volume: number };
    } = {
        background: "#000000",
        tracks,
    };
    if (input.soundtrackUrl) {
        timeline.soundtrack = {
            src: input.soundtrackUrl,
            effect: "fadeInFadeOut",
            volume: 0.6,
        };
    }
    return timeline;
}

async function pollShotstackUntilDone(input: {
    apiKey: string;
    renderId: string;
    maxWaitMs: number;
}): Promise<{ url?: string; status: string }> {
    const start = Date.now();
    // Backoff: check every 3s, but not more than 60 polls.
    while (Date.now() - start < input.maxWaitMs) {
        await sleep(3000);
        const res = await fetch(`${SHOTSTACK_BASE}/render/${input.renderId}`, {
            headers: { "x-api-key": input.apiKey },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "<no body>");
            throw new Error(`Shotstack poll failed ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const status: string = data?.response?.status;
        if (status === "done") {
            return { url: data?.response?.url, status };
        }
        if (status === "failed") {
            throw new Error(`Shotstack render failed: ${JSON.stringify(data?.response ?? {})}`);
        }
        // "queued" | "fetching" | "rendering" | "saving" → keep waiting.
    }
    throw new Error(`Shotstack render timed out after ${input.maxWaitMs}ms`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
