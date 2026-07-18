/**
 * One-off script: generate a 5-scene narrative brand video from a
 * real Modaire listing. Each scene = one 5-second Runway Gen-4 Turbo
 * clip, saved to S3, uploaded independently. Assemble the 5 clips
 * yourself in CapCut / Reels editor / whatever (~2 min in any of
 * them).
 *
 * The script auto-picks a hero listing from your inventory: highest-
 * priced featured + AVAILABLE + APPROVED item. That's usually a
 * bridal / formal piece which fits the narrative's wedding-scene
 * moment. Override with --listing <id-or-url> if you want a specific
 * piece.
 *
 * Usage:
 *   npx tsx scripts/generate-narrative-video.ts
 *   npx tsx scripts/generate-narrative-video.ts --listing 8a271309-...
 *
 * Requires: RUNWAY_API_KEY in .env. Uses ~125 credits (~$1.25) total.
 * Runtime: ~5-8 minutes (5 clips sequential at ~60-90s each).
 *
 * All 5 MP4s land at https://modestvault.s3.us-east-1.amazonaws.com/marketing/YYYY-MM-DD/<uuid>.mp4
 * and are publicly readable (bucket policy covers marketing/*).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateVideo } from "../src/lib/marketing/agents/video";
import type { VideoVisualMood, VideoCameraMotion } from "../src/lib/marketing/types";

// ── args ──
function parseArgs() {
    const args = process.argv.slice(2);
    const out: Record<string, string> = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a.startsWith("--")) continue;
        const key = a.slice(2);
        const val = args[i + 1];
        if (!val || val.startsWith("--")) out[key] = "true";
        else { out[key] = val; i += 1; }
    }
    return out;
}

// Extract listing id from either a raw id or a full URL.
function extractListingId(raw: string | undefined): string | null {
    if (!raw) return null;
    const m = raw.match(/\/listings\/([^/?#]+)/);
    return m ? m[1] : raw;
}

// ── prisma ──
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── scene definitions ──
// Each scene reuses the same hero photo as the Runway reference so the
// generated clips stay visually anchored to a real Modaire piece.
// The prompt (hook + mood + camera + atmosphere) is what shifts the
// scene between embroidery close-up, mirror moment, wardrobe pan, etc.
type Scene = {
    name: string;
    hook: string;
    visualMood: VideoVisualMood;
    cameraMotion: VideoCameraMotion;
    settingAtmosphere: string;
};

const SCENES: Scene[] = [
    {
        name: "01-embroidery",
        hook: "Extreme close-up of luxurious embroidered fabric, delicate hand tracing the beadwork, threadwork glinting",
        visualMood: "warm-golden",
        cameraMotion: "reveal",
        settingAtmosphere: "soft morning light streaming across silk, dust motes visible",
    },
    {
        name: "02-getting-ready",
        hook: "Elegant South Asian woman putting on jhumka earrings, mirror reflection, calm intimate moment",
        visualMood: "warm-golden",
        cameraMotion: "static-hold",
        settingAtmosphere: "gold jewelry glimmering, soft candle glow in background",
    },
    {
        name: "03-wardrobe",
        hook: "Camera slowly drifting past a boutique wardrobe of colorful modest outfits — kaftans, lehengas, abayas on velvet hangers",
        visualMood: "dramatic-low-key",
        cameraMotion: "orbit",
        settingAtmosphere: "silk brushing gently as camera passes, jewel tones under warm spotlights",
    },
    {
        name: "04-discovery",
        hook: "Young woman lounging with phone, scrolls through Modaire, pauses, smiles when she finds the outfit",
        visualMood: "soft-morning",
        cameraMotion: "slow-push",
        settingAtmosphere: "cozy warm bedroom, phone screen glow on her face, a small delighted smile forming",
    },
    {
        name: "05-celebration",
        hook: "Woman wearing the beautiful outfit at a joyous Eid gathering, spinning slowly in slow motion, friends laughing around her",
        visualMood: "festive-vibrant",
        cameraMotion: "orbit",
        settingAtmosphere: "celebration ambient light, warm crowd blurred in background, joyful energy",
    },
];

// ── main ──
async function main() {
    const args = parseArgs();
    const overrideListingId = extractListingId(args["listing"]);

    // 1. Pick the hero listing. Override wins; otherwise auto-pick.
    const listing = overrideListingId
        ? await prisma.listing.findUnique({
            where: { id: overrideListingId },
            select: {
                id: true, title: true, price: true, image_url: true, status: true,
                images: { orderBy: { imageOrder: "asc" }, select: { imageUrl: true, mediumUrl: true } },
            },
        })
        : await prisma.listing.findFirst({
            where: {
                is_featured: true,
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
            // Highest-priced featured item = usually bridal/formal, which
            // fits the wedding-scene narrative moment.
            orderBy: { price: "desc" },
            select: {
                id: true, title: true, price: true, image_url: true, status: true,
                images: { orderBy: { imageOrder: "asc" }, select: { imageUrl: true, mediumUrl: true } },
            },
        });

    if (!listing || listing.status !== "AVAILABLE") {
        console.error("No hero listing found. Try --listing <id-or-url>.");
        process.exit(1);
    }

    const heroPhoto = listing.images[0]?.imageUrl ?? listing.image_url;
    if (!heroPhoto || !/^https?:\/\//i.test(heroPhoto)) {
        console.error(
            `Hero photo URL is not publicly reachable (Runway needs https://): ${heroPhoto}`,
        );
        process.exit(1);
    }

    console.log("─".repeat(60));
    console.log(`Hero listing: ${listing.title}  ($${Number(listing.price).toFixed(2)})`);
    console.log(`Reference photo: ${heroPhoto}`);
    console.log(`Scenes: ${SCENES.length} × 5s = ~${SCENES.length * 5}s total`);
    console.log(`Est. cost: ~${SCENES.length * 25} Runway credits (~$${(SCENES.length * 0.25).toFixed(2)})`);
    console.log("─".repeat(60));
    console.log();

    // 2. Generate each scene sequentially. Runway rate-limits parallel
    //    submissions on the free tier; sequential is safer.
    const results: Array<{ scene: string; s3Url: string }> = [];
    let failed = 0;
    for (let i = 0; i < SCENES.length; i++) {
        const scene = SCENES[i];
        const label = `[${i + 1}/${SCENES.length}] ${scene.name}`;
        console.log(`${label} — submitting to Runway...`);
        const t0 = Date.now();
        try {
            const video = await generateVideo({
                platform: "INSTAGRAM_REEL",
                listing: {
                    id: listing.id,
                    title: listing.title,
                    price: Number(listing.price),
                    photoUrls: [heroPhoto],
                },
                hook: scene.hook,
                visualMood: scene.visualMood,
                cameraMotion: scene.cameraMotion,
                settingAtmosphere: scene.settingAtmosphere,
                durationSec: 5,
            });
            const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
            console.log(`${label} — done in ${elapsed}s`);
            console.log(`   ${video.s3Url}`);
            results.push({ scene: scene.name, s3Url: video.s3Url });
        } catch (err) {
            failed += 1;
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`${label} — FAILED: ${msg}`);
        }
    }

    // 3. Summary.
    console.log();
    console.log("─".repeat(60));
    console.log(`Done. sent=${results.length}  failed=${failed}`);
    console.log("─".repeat(60));
    if (results.length > 0) {
        console.log("\nAll clip URLs (in narrative order):");
        for (const r of results) {
            console.log(`  ${r.scene}   ${r.s3Url}`);
        }
        console.log("\nDownload all 5 and assemble in CapCut / Reels editor.");
        console.log("Recommended: 0.5s crossfade between clips; add trending audio.");
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
