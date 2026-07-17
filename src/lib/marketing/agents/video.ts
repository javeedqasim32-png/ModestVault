import { randomUUID } from "crypto";
import { uploadFile, getS3BucketName, buildS3ImageUrl } from "@/lib/s3";
import type { MarketingPlatform, VideoVisualMood, VideoCameraMotion } from "../types";

/**
 * VideoAgent — generates a cinematic 9:16 AI video from a listing
 * photo using Runway's Gen-4 Turbo image-to-video model. Output: MP4
 * uploaded to our S3.
 *
 * Why Runway instead of a Shotstack slideshow: slideshows of static
 * product photos look amateur no matter how well you compose them.
 * Runway generates actual movement — models turning, fabric flowing,
 * cinematic camera work — starting from the listing's real photo, so
 * product fidelity is preserved.
 *
 * Runway signup: https://runwayml.com/api
 *   Free trial: ~10,000 credits (~400 clips at 5s default duration)
 *   gen4_turbo: 5 credits/sec (cheapest, fastest — what we use)
 *   gen4:       10 credits/sec (higher quality, slower)
 *   Set RUNWAY_API_KEY in .env
 *
 * Cost per clip (5-second default): ~25 credits = ~$0.25 out of trial.
 *
 * Reality check: even at Runway's quality, results look "AI-generated"
 * to a discerning viewer. Product identity is well-preserved (~80%),
 * face/hand consistency is spotty (~50%), fabric drape is decent.
 * Best used for: hero brand videos, single-piece spotlights. NOT for
 * viral TikTok (that requires actual human recording).
 */

type GeneratedVideo = {
    s3Url: string;
    widthPx: number;
    heightPx: number;
    durationSec: number;
    generator: "runway";
};

// Runway API — Dev API is the current stable endpoint for programmatic
// access. Version header pins the response shape (Runway is on a
// versioned-header contract like Stripe).
const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";

// Story format everywhere. Runway supports 720:1280 (9:16 vertical)
// which the same MP4 works as IG Story, FB Story, IG Reel, TikTok.
const VIDEO_SPEC = {
    widthPx: 720,
    heightPx: 1280,
    ratio: "720:1280" as const,
};

// Keep clips short. Free trial credits are precious; short clips also
// have fewer opportunities for AI drift (faces morphing, fabric
// deforming). 5 seconds is Runway's minimum and our default.
const CLIP_DURATION_SEC = 5;

export async function generateVideo(input: {
    platform: MarketingPlatform;
    listing: {
        id: string;
        title: string;
        price: number;
        photoUrls: string[]; // First one is used as the reference image
    };
    /** Director-provided visual hook — becomes the anchor of the
     *  Runway prompt (e.g. "Model in ivory kaftan turning slowly"). */
    hook?: string;
    /** Director-chosen lighting/atmosphere preset. Falls back to
     *  soft-morning if omitted. */
    visualMood?: VideoVisualMood;
    /** Director-chosen camera-movement preset. Falls back to slow-push
     *  if omitted. */
    cameraMotion?: VideoCameraMotion;
    /** Director's optional atmospheric extras — free-text like
     *  "petals falling in soft light". */
    settingAtmosphere?: string;
}): Promise<GeneratedVideo> {
    const apiKey = process.env.RUNWAY_API_KEY;
    if (!apiKey) {
        throw new Error(
            "RUNWAY_API_KEY is required for VideoAgent. Sign up at https://runwayml.com/api",
        );
    }

    // Runway image_to_video needs a PUBLICLY reachable HTTP(S) URL for
    // the reference photo. Relative paths from dev-mode aren't allowed.
    const referenceUrl = input.listing.photoUrls[0];
    if (!referenceUrl || !/^https?:\/\//i.test(referenceUrl)) {
        throw new Error(
            `Runway needs a public https URL for the reference image. Got: ${referenceUrl}`,
        );
    }

    // Build the cinematic prompt from the Director's hook + chosen
    // style dimensions. Runway prompts respond best to: subject +
    // motion + camera + lighting + style, in that order.
    const promptText = buildRunwayPrompt({
        hook: input.hook,
        listingTitle: input.listing.title,
        visualMood: input.visualMood,
        cameraMotion: input.cameraMotion,
        settingAtmosphere: input.settingAtmosphere,
    });

    // 1. Submit image-to-video job.
    const submitRes = await fetch(`${RUNWAY_BASE}/image_to_video`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Runway-Version": RUNWAY_VERSION,
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gen4_turbo",
            promptImage: referenceUrl,
            promptText,
            duration: CLIP_DURATION_SEC,
            ratio: VIDEO_SPEC.ratio,
        }),
    });
    if (!submitRes.ok) {
        const body = await submitRes.text().catch(() => "<no body>");
        throw new Error(`Runway submit failed ${submitRes.status}: ${body.slice(0, 400)}`);
    }
    const submitData = await submitRes.json();
    const taskId: string | undefined = submitData?.id;
    if (!taskId) throw new Error(`Runway submit returned no task id: ${JSON.stringify(submitData).slice(0, 200)}`);

    // 2. Poll for completion. Runway gen4_turbo clocks in around
    //    30-90 seconds for a 5-second clip. Cap at 5 minutes to keep
    //    the Director from hanging on a stuck render.
    const finishedUrl = await pollRunwayUntilDone({
        apiKey,
        taskId,
        maxWaitMs: 5 * 60 * 1000,
    });

    // 3. Download the finished MP4 and mirror to our S3. Runway's own
    //    URLs are short-lived (~24h) — we always keep our own copy.
    const mp4Res = await fetch(finishedUrl);
    if (!mp4Res.ok) throw new Error(`Fetch Runway MP4 failed ${mp4Res.status}`);
    const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());

    const bucket = getS3BucketName();
    const key = `marketing/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.mp4`;
    await uploadFile(mp4Buffer, key, "video/mp4", bucket);
    const s3Url = buildS3ImageUrl(key, bucket);

    return {
        s3Url,
        widthPx: VIDEO_SPEC.widthPx,
        heightPx: VIDEO_SPEC.heightPx,
        durationSec: CLIP_DURATION_SEC,
        generator: "runway",
    };
}

/**
 * Runway prompts follow the pattern: [subject + action] + [camera
 * movement] + [lighting/mood] + [ambient atmosphere] + [style baseline].
 *
 * Director-picked enums map to natural-language prompt fragments here;
 * that keeps the LLM producing bounded, safe values (enum) while letting
 * the fragments be tuned centrally as we learn what Runway responds to.
 */
function buildRunwayPrompt(input: {
    hook?: string;
    listingTitle: string;
    visualMood?: VideoVisualMood;
    cameraMotion?: VideoCameraMotion;
    settingAtmosphere?: string;
}): string {
    const subject = input.hook || `Model wearing ${input.listingTitle}`;
    const camera = CAMERA_FRAGMENTS[input.cameraMotion ?? "slow-push"];
    const mood = MOOD_FRAGMENTS[input.visualMood ?? "soft-morning"];
    const atmosphere = (input.settingAtmosphere ?? "").trim();
    // Style baseline — kept locked so all Modaire videos share a
    // family resemblance (editorial fashion film).
    const styleBaseline = "editorial fashion film, shallow depth of field, elegant motion";

    const parts = [subject, camera, mood, atmosphere, styleBaseline].filter(Boolean);
    // Runway caps prompts at ~512 chars — trim defensively.
    return parts.join(". ").slice(0, 500);
}

/** Camera-motion enum → prompt fragment. */
const CAMERA_FRAGMENTS: Record<VideoCameraMotion, string> = {
    "slow-push": "slow cinematic zoom-in, gentle push toward the subject",
    "orbit": "camera slowly orbits around the subject, revealing the full silhouette",
    "reveal": "detail pull-out, camera drifts across the fabric, close-up focus on texture and embroidery",
    "handheld-sway": "subtle handheld camera, organic natural movement",
    "static-hold": "static locked camera, no movement, subject occupies frame",
};

/** Visual-mood enum → prompt fragment. */
const MOOD_FRAGMENTS: Record<VideoVisualMood, string> = {
    "warm-golden": "warm golden hour lighting, sunset side light, honey tones, cinematic glow",
    "soft-morning": "soft natural morning daylight, airy diffused light, dreamy pastel tones",
    "studio-bright": "clean bright studio lighting, even white key light, minimal shadows",
    "dramatic-low-key": "moody low-key lighting, deep shadows, dramatic contrast, single directional light",
    "festive-vibrant": "warm celebratory ambient light, festive glow, rich cultural atmosphere",
};

async function pollRunwayUntilDone(input: {
    apiKey: string;
    taskId: string;
    maxWaitMs: number;
}): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < input.maxWaitMs) {
        await sleep(4000);
        const res = await fetch(`${RUNWAY_BASE}/tasks/${input.taskId}`, {
            headers: {
                "X-Runway-Version": RUNWAY_VERSION,
                Authorization: `Bearer ${input.apiKey}`,
            },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "<no body>");
            throw new Error(`Runway poll failed ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const status: string = data?.status;
        if (status === "SUCCEEDED") {
            const output = data?.output;
            if (Array.isArray(output) && typeof output[0] === "string") {
                return output[0];
            }
            throw new Error(`Runway SUCCEEDED with no output: ${JSON.stringify(data).slice(0, 300)}`);
        }
        if (status === "FAILED" || status === "CANCELLED") {
            const err = data?.failure || data?.error || "unknown";
            throw new Error(`Runway render ${status}: ${err}`);
        }
        // PENDING | RUNNING → keep waiting.
    }
    throw new Error(`Runway render timed out after ${input.maxWaitMs}ms`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
