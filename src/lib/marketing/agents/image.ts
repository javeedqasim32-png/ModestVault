import sharp from "sharp";
import { randomUUID } from "crypto";
import { uploadFile, getS3BucketName, buildS3ImageUrl } from "@/lib/s3";
import type { GeneratedImage, MarketingPlatform } from "../types";

/**
 * ImageAgent — composites listing photo → Story-format (1080×1920)
 * social ad. Same asset works as IG Story, FB Story, IG Reel cover,
 * or TikTok cover.
 *
 * Design — the "Spotify cover" treatment:
 *   1. Blurred + darkened version of the source photo fills the entire
 *      canvas (no more solid cream background that looks like a
 *      screenshot of a webpage — the ad now has *atmosphere*).
 *   2. The full unblurred product photo sits on top, `fit: contain`
 *      so the whole dress is visible without cropping.
 *   3. Dark gradient scrim at the bottom.
 *   4. Editorial typography ON the scrim: serif hook headline, price
 *      in accent color, CTA at the very bottom.
 *   5. Modaire wordmark small in the top corner.
 *
 * Every platform outputs the same dimensions. Static PNG, so this
 * won't win virality on its own — pair with VideoAgent (Shotstack)
 * for content that actually gets shared.
 */

type ImageSpec = { widthPx: number; heightPx: number };

const STORY_SPEC: ImageSpec = { widthPx: 1080, heightPx: 1920 };
const SPECS: Record<MarketingPlatform, ImageSpec> = {
    FACEBOOK: STORY_SPEC,
    INSTAGRAM_FEED: STORY_SPEC,
    INSTAGRAM_STORY: STORY_SPEC,
    INSTAGRAM_REEL: STORY_SPEC,
    TIKTOK: STORY_SPEC,
};

// Brand palette — used for tinting and text.
const INK_HEX = "#2f2925";
const ACCENT_HEX = "#d4a574"; // Warm gold — reads better on dark scrims than the cream-toned accent

export async function generateImage(input: {
    platform: MarketingPlatform;
    sourceImageUrl: string;
    listing: {
        title: string;
        price: number;
        size?: string | null;
        brand?: string | null;
    };
    /** Director-provided short overlay text. When present, this
     *  replaces the auto-generated title as the visual headline. */
    hook?: string;
}): Promise<GeneratedImage> {
    const spec = SPECS[input.platform];

    // 1. Fetch source photo.
    const sourceBuffer = await fetchImage(input.sourceImageUrl);

    // 2. Blurred + darkened background — same photo, blown up and blurred
    //    to create ambient atmosphere. Overlayed with a semi-transparent
    //    dark layer so the foreground photo has contrast to stand against.
    const backgroundLayer = await sharp(sourceBuffer)
        .resize(spec.widthPx, spec.heightPx, { fit: "cover", position: "center" })
        .blur(45)
        .modulate({ brightness: 0.55, saturation: 1.15 })
        .toBuffer();

    // 3. Foreground product photo — full-visible via `fit: contain`.
    //    Occupies roughly 60% of vertical space (leaves room for text
    //    scrim + wordmark).
    const foregroundHeight = Math.round(spec.heightPx * 0.62);
    const foregroundWidth = spec.widthPx;
    const foregroundLayer = await sharp(sourceBuffer)
        .resize(foregroundWidth, foregroundHeight, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    // Vertically nudge the foreground photo slightly above center so
    // it doesn't collide with the bottom scrim.
    const foregroundTop = Math.round(spec.heightPx * 0.13);

    // 4. Gradient scrim at bottom — SVG lets us bake in a linear
    //    gradient without a second sharp pass.
    const scrimSvg = buildScrimSvg({
        widthPx: spec.widthPx,
        heightPx: spec.heightPx,
        listing: input.listing,
        hook: input.hook,
    });

    // 5. Modaire wordmark at top (small, white-on-dark since the
    //    blurred background is dark).
    const wordmarkSvg = buildWordmarkSvg();

    // 6. Compose: blurred bg → foreground photo → scrim + text overlay → wordmark.
    const composed = await sharp(backgroundLayer)
        .composite([
            { input: foregroundLayer, top: foregroundTop, left: 0 },
            { input: Buffer.from(scrimSvg), top: 0, left: 0 },
            { input: Buffer.from(wordmarkSvg), top: 60, left: 60 },
        ])
        .png({ compressionLevel: 9 })
        .toBuffer();

    // 7. Upload to S3.
    const bucket = getS3BucketName();
    const key = `marketing/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.png`;
    await uploadFile(composed, key, "image/png", bucket);
    const s3Url = buildS3ImageUrl(key, bucket);
    return {
        s3Url,
        widthPx: spec.widthPx,
        heightPx: spec.heightPx,
    };
}

async function fetchImage(url: string): Promise<Buffer> {
    if (url.startsWith("/")) {
        const fs = await import("fs/promises");
        const path = await import("path");
        return fs.readFile(path.join(process.cwd(), "public", url.replace(/^\//, "")));
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch source image failed ${res.status}: ${url}`);
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
}

/**
 * Full-canvas SVG. Two purposes:
 *   - Draws a dark linear gradient from transparent (top) to near-black
 *     (bottom) so the bottom half stays readable no matter what the
 *     source photo looks like.
 *   - Overlays the text (hook, price, meta, CTA) on that scrim in an
 *     editorial layout: serif hook, big price in accent, small caps CTA.
 */
function buildScrimSvg(input: {
    widthPx: number;
    heightPx: number;
    listing: { title: string; price: number; size?: string | null; brand?: string | null };
    hook?: string;
}): string {
    const { widthPx, heightPx, listing, hook } = input;
    const price = `$${listing.price.toFixed(2)}`;
    const meta = [
        listing.size ? `Size ${listing.size}` : null,
        listing.brand ? listing.brand : null,
    ].filter(Boolean).join("  ·  ");
    const headline = escapeXml(truncate(hook || listing.title, 32));
    const metaEsc = escapeXml(meta);

    // Text y-coordinates anchored to the bottom of the canvas so
    // adjusting the header height doesn't shift the ad footer.
    const bottomBase = heightPx - 70; // CTA baseline
    const priceY = bottomBase - 140;
    const headlineY = priceY - 100;
    const metaY = priceY + 60;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="${Math.round(heightPx * 0.55)}" x2="0" y2="${heightPx}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000000" stop-opacity="0" />
      <stop offset="0.65" stop-color="#000000" stop-opacity="0.55" />
      <stop offset="1" stop-color="#000000" stop-opacity="0.88" />
    </linearGradient>
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="${Math.round(heightPx * 0.2)}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000000" stop-opacity="0.40" />
      <stop offset="1" stop-color="#000000" stop-opacity="0" />
    </linearGradient>
  </defs>
  <style>
    .headline { font: 700 84px 'Playfair Display', 'Georgia', serif; fill: #ffffff; letter-spacing: -0.015em; }
    .price    { font: 700 96px 'Playfair Display', 'Georgia', serif; fill: ${ACCENT_HEX}; }
    .meta     { font: 500 32px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; opacity: 0.75; letter-spacing: 0.08em; }
    .cta      { font: 700 26px 'Helvetica Neue', Arial, sans-serif; fill: #ffffff; letter-spacing: 0.32em; opacity: 0.9; }
  </style>
  <rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="url(#topFade)" />
  <rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="url(#scrim)" />
  <text x="60" y="${headlineY}" class="headline">${headline}</text>
  <text x="60" y="${priceY}" class="price">${price}</text>
  <text x="60" y="${metaY}" class="meta">${metaEsc}</text>
  <text x="60" y="${bottomBase}" class="cta">SHOP · SHOPMODAIRE.COM  →</text>
</svg>`;
}

function buildWordmarkSvg(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="260" height="46" viewBox="0 0 260 46">
  <text x="0" y="36" font-family="'Playfair Display','Georgia',serif" font-size="38" font-weight="700" fill="#ffffff" letter-spacing="0.03em">Modaire</text>
</svg>`;
}

function truncate(s: string, n: number): string {
    return s.length <= n ? s : `${s.slice(0, n - 1).trim()}…`;
}

function escapeXml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
