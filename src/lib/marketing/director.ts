import { prisma } from "@/lib/prisma";
import { generateCopy } from "./agents/copy";
import { generateImage } from "./agents/image";
import { generateVideo } from "./agents/video";
import { callDirectorLLM, DIRECTOR_MODEL, estimateCostUsd } from "./director-llm";
import { renderBrandBriefForPrompt } from "./brand-brief";
import { getCalendarHorizon, renderCalendarHorizonForPrompt } from "./calendar";
import { gatherBusinessIntel, renderBusinessIntelForPrompt } from "./intel/business-review";
import type {
    MarketingPlan,
    MarketingTask,
    MarketingContentType,
    MarketingPlatform,
} from "./types";

/**
 * Marketing Director — the CEO of the Marketing Executive Team.
 *
 * Runs once per day (via cron) and does three things in order:
 *   1. Gathers intelligence (business review + calendar horizon + brand brief).
 *   2. Makes a strategic decision (one Anthropic LLM call → structured plan).
 *   3. Delegates to specialist agents (CopyAgent + ImageAgent per task).
 *
 * Persists a MarketingBriefing row per run for audit + future prompt
 * tuning. Every MarketingDraft it creates links back to that briefing.
 *
 * Contrast with the pre-Phase-1 Director: that was a `for` loop over
 * featured listings. This one actually decides what today should be.
 */
export async function runDirector(options: {
    /** Skip actually calling Anthropic + writing DB rows. Prints the
     *  intel + plan so a human can eyeball the reasoning. */
    dryRun?: boolean;
    /** Override the max tasks Anthropic is asked to plan (default 6). */
    maxTasks?: number;
    /** When true, generates a new briefing even if one already exists
     *  today. Otherwise the cron is idempotent per calendar day. */
    force?: boolean;
}): Promise<{
    scanned: number;
    briefingId: string | null;
    theme: string | null;
    draftsCreated: number;
    draftsFailed: number;
    costUsd: number;
}> {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    // 0. Idempotency guard — one briefing per day unless --force.
    if (!options.force && !options.dryRun) {
        const startOfDay = new Date(todayIso + "T00:00:00Z");
        const existing = await prisma.marketingBriefing.findFirst({
            where: { ran_at: { gte: startOfDay } },
            select: { id: true },
        });
        if (existing) {
            return {
                scanned: 0,
                briefingId: existing.id,
                theme: null,
                draftsCreated: 0,
                draftsFailed: 0,
                costUsd: 0,
            };
        }
    }

    // 1. INTELLIGENCE — all parallel, none depend on each other.
    const [businessIntel, calendarHorizon] = await Promise.all([
        gatherBusinessIntel(),
        Promise.resolve(getCalendarHorizon(todayIso)),
    ]);

    const intelDigest = [
        renderBusinessIntelForPrompt(businessIntel),
        renderCalendarHorizonForPrompt(calendarHorizon),
    ].join("\n\n---\n\n");

    if (options.dryRun) {
        console.log("─".repeat(60));
        console.log("BRAND BRIEF");
        console.log("─".repeat(60));
        console.log(renderBrandBriefForPrompt());
        console.log();
        console.log("─".repeat(60));
        console.log("INTELLIGENCE");
        console.log("─".repeat(60));
        console.log(intelDigest);
        return {
            scanned: 1,
            briefingId: null,
            theme: null,
            draftsCreated: 0,
            draftsFailed: 0,
            costUsd: 0,
        };
    }

    // 2. STRATEGIC DECISION — one OpenAI call → structured JSON plan.
    let plan: MarketingPlan;
    let inputTokens = 0;
    let outputTokens = 0;
    let modelUsed = DIRECTOR_MODEL as string;
    try {
        const systemPrompt = buildDirectorSystemPrompt(options.maxTasks ?? 6);
        const userPrompt = `${intelDigest}\n\nNow: plan today's content. Return ONLY the JSON object described in the system prompt.`;
        const result = await callDirectorLLM({ systemPrompt, userPrompt });
        plan = parseAndValidatePlan(result.rawText);
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        modelUsed = result.model;
    } catch (err) {
        console.error("[Director] LLM planning failed:", err);
        return {
            scanned: 1,
            briefingId: null,
            theme: null,
            draftsCreated: 0,
            draftsFailed: 0,
            costUsd: 0,
        };
    }

    const costUsd = estimateCostUsd(inputTokens, outputTokens);

    // 3. Persist the briefing so drafts can reference it + admin can
    //    see the "why."
    const briefing = await prisma.marketingBriefing.create({
        data: {
            theme: plan.theme.slice(0, 500),
            rationale: plan.rationale,
            content_mix: plan.contentMix as any,
            intelligence: {
                business: businessIntel,
                calendar: calendarHorizon,
            } as any,
            model: modelUsed,
            cost_estimate: costUsd,
        },
    });

    // 4. DELEGATION — spawn drafts for each task. Serial to be gentle
    //    on sharp + OpenAI rate limits (t3.micro on prod is CPU-tight).
    let draftsCreated = 0;
    let draftsFailed = 0;
    for (const task of plan.tasks) {
        try {
            const listing = task.listingId
                ? await prisma.listing.findUnique({
                    where: { id: task.listingId },
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        price: true,
                        image_url: true,
                        category: true,
                        brand: true,
                        size: true,
                        status: true,
                        moderation_status: true,
                        // For VIDEO tasks we need multiple photos to build
                        // the slideshow — pull all listing images ordered.
                        images: {
                            orderBy: { imageOrder: "asc" },
                            select: { imageUrl: true, mediumUrl: true },
                        },
                    },
                })
                : null;

            // Skip tasks that referenced a listing that's since sold /
            // been rejected. Better to lose a draft than post a stale one.
            if (task.listingId && (!listing || listing.status !== "AVAILABLE")) {
                console.warn(
                    `[Director] Skipping task — listing ${task.listingId} not available.`,
                );
                draftsFailed += 1;
                continue;
            }

            // TEXT-ONLY posts (inspiration/community with no listing tie)
            // are supported but the CopyAgent + ImageAgent path needs a
            // listing to render — skip for now, they're rare and Phase 1.
            if (!listing) {
                console.warn(
                    `[Director] Skipping TEXT-only task (no listing) — Phase 1 only supports listing-tied posts.`,
                );
                draftsFailed += 1;
                continue;
            }

            // Photo URLs for VIDEO tasks — Runway needs the ORIGINAL
            // full-res image as the reference (medium renditions can
            // produce softer results). Falls back to medium/thumb only
            // if original is missing.
            const photoUrls = listing.images.length > 0
                ? listing.images.map((img) => img.imageUrl ?? img.mediumUrl)
                : [listing.image_url];

            const [copy, asset] = await Promise.all([
                generateCopy({
                    platform: task.platform,
                    listing: {
                        title: listing.title,
                        description: listing.description,
                        price: Number(listing.price),
                        category: listing.category,
                        brand: listing.brand,
                        size: listing.size,
                    },
                    theme: plan.theme,
                    hook: task.hook,
                    angle: task.angle,
                    pillar: task.pillar,
                }),
                task.contentType === "IMAGE"
                    ? generateImage({
                        platform: task.platform,
                        sourceImageUrl: listing.image_url,
                        listing: {
                            title: listing.title,
                            price: Number(listing.price),
                            size: listing.size,
                            brand: listing.brand,
                        },
                        hook: task.hook,
                    })
                    : task.contentType === "VIDEO"
                        ? generateVideo({
                            platform: task.platform,
                            listing: {
                                id: listing.id,
                                title: listing.title,
                                price: Number(listing.price),
                                photoUrls,
                            },
                            hook: task.hook,
                            visualMood: task.visualMood,
                            cameraMotion: task.cameraMotion,
                            settingAtmosphere: task.settingAtmosphere,
                        })
                        : Promise.resolve(null),
            ]);

            await prisma.marketingDraft.create({
                data: {
                    briefing_id: briefing.id,
                    listing_id: listing.id,
                    platform: task.platform,
                    content_type: task.contentType,
                    caption: copy.caption,
                    hashtags: copy.hashtags,
                    hook: task.hook,
                    angle: task.angle,
                    asset_urls: asset ? [asset.s3Url] : [],
                    status: "PENDING",
                    agent_metadata: {
                        director: "phase1-llm-ceo",
                        directorModel: modelUsed,
                        pillar: task.pillar,
                        priority: task.priority,
                        // Which service produced the asset — useful for
                        // debugging quality per generator and comparing
                        // engagement per source (once metrics loop is on).
                        assetGenerator: asset && "generator" in asset
                            ? (asset as { generator?: string }).generator
                            : task.contentType === "IMAGE" ? "sharp" : null,
                    } as any,
                },
            });
            draftsCreated += 1;
        } catch (err) {
            draftsFailed += 1;
            console.error(
                `[Director] Failed to create draft for task ${task.platform}/${task.listingId}:`,
                err,
            );
        }
    }

    return {
        scanned: 1,
        briefingId: briefing.id,
        theme: plan.theme,
        draftsCreated,
        draftsFailed,
        costUsd,
    };
}

// ────────────────────────────────────────────────────────────────────
// Plan parsing + validation (OpenAI returns clean JSON via response_format)
// ────────────────────────────────────────────────────────────────────

function parseAndValidatePlan(rawText: string): MarketingPlan {
    let plan: MarketingPlan;
    try {
        plan = JSON.parse(rawText) as MarketingPlan;
    } catch (err) {
        throw new Error(
            `Director returned invalid JSON: ${(err as Error).message}\nRaw:\n${rawText.slice(0, 500)}`,
        );
    }
    validatePlan(plan);
    return plan;
}

function buildDirectorSystemPrompt(maxTasks: number): string {
    return `You are the Marketing Director for Modaire, an e-commerce marketplace for modest women's fashion. Every morning, you make ONE strategic decision about what today's marketing content should accomplish, then hand specific tasks to specialist creative agents.

${renderBrandBriefForPrompt()}

---

# Your job today

Given the intelligence below (business state + marketing calendar horizon), decide:
1. **The one strategic bet for today.** A single-sentence theme, not a to-do list. Examples of good themes:
   - "Wedding-season affordable picks under $150 — position Modaire as the destination"
   - "Eid anticipation content — build gift-guide + occasion-wear buildup 18 days out"
   - "Recover cart abandoners with community-story social content"
   - "Post-Ramadan gratitude recap + point new customers to the Eid Edit"
   Themes should tie to **what's actually happening today** — active calendar events, upcoming events in their build window, active promos, or business-state signals (e.g. "unsold inventory > 30 days" → spotlight overlooked pieces).

2. **A short rationale.** 2-3 sentences explaining WHY this theme, referencing specific intel signals.

3. **A content mix.** How many posts total, roughly what pillar ratios (product/inspiration/community), and per-platform counts.

4. **Concrete tasks** the specialist agents will execute. Max ${maxTasks} tasks. Each task = one MarketingDraft.

# Rules

- If an active promotion exists, the theme MUST reference it. Don't publish sale-agnostic content while a sale is live.
- If a cultural event is in the "Imminent" or "Building" window with high audienceRelevance, weight your plan toward it.
- If a task features a specific listing, use IDs from the "Most viewed" or "Most favorited" lists in the intel — those are proven interest signals.
- Every task's \`hook\` should be a sharp opener (4-8 words) — this becomes both the visual overlay text AND the LLM's caption lede.
- Every task's \`angle\` should be a specific subset of the theme (e.g. theme = "wedding-season affordable picks"; angle = "under-$100 mother-of-the-bride pieces").
- Prefer diversity: don't have 5 posts about the same listing. Mix listings when the theme allows.
- Supported content types: "IMAGE" (Story-format static composite) and "VIDEO" (Runway Gen-4 AI-generated cinematic clip — 5 seconds, starts from the listing's hero photo and generates motion). Do NOT plan TEXT-only tasks.
- All assets output in Story format (9:16 vertical). Target INSTAGRAM_STORY, INSTAGRAM_REEL, TIKTOK, and FACEBOOK. The same asset works across all Story surfaces.
- Prefer VIDEO for hero listings — cinematic AI motion is more engaging than a static image. Use IMAGE when the message is text-heavy (sale-price emphasis, "3 pieces on sale" summary) or when a listing has weak/single photos.
- **For VIDEO tasks, the \`hook\` is CRITICAL** — it becomes the Runway prompt's anchor for what should happen in the clip. Write hooks as SHORT CINEMATIC INSTRUCTIONS, not marketing copy:
  - ✅ "Model in ivory kaftan turning slowly, fabric flowing"
  - ✅ "Close-up of embroidered lehenga, hand tracing the beadwork"
  - ✅ "Woman in hijab walking through golden light, silk dupatta trailing"
  - ❌ "Elevate Your Wedding Style"  ← reads as a headline, not a shot direction
  - ❌ "Summer Sale — 15% off"        ← not filmable
  Runway needs a SUBJECT + ACTION. The angle field can still carry the strategic framing; the hook must be visualizable.
- **For VIDEO tasks, ALSO set the cinematography** — three fields that let you match the aesthetic to the piece + campaign:

  **\`visualMood\` (required for VIDEO)** — one of:
    - \`warm-golden\` — Golden hour side light, sunset warmth. Best for BRIDAL, EVENING, FORMAL pieces, cultural celebrations.
    - \`soft-morning\` — Airy natural daylight, dreamy. Best for EVERYDAY, CASUAL, WEDDING-GUEST pieces.
    - \`studio-bright\` — Clean bright white lighting. Best for PRODUCT-FIRST sale posts, "3 pieces on sale" spotlights.
    - \`dramatic-low-key\` — Moody shadows, cinematic contrast. Best for STATEMENT / LUXURY drop pieces, hero spotlights.
    - \`festive-vibrant\` — Warm colorful ambient celebration light. Best for EID, RAMADAN, WEDDING, culturally-anchored content.

  **\`cameraMotion\` (required for VIDEO)** — one of:
    - \`slow-push\` — Slow cinematic zoom-in. Contemplative, works for anything (safe default).
    - \`orbit\` — Camera slowly rotates around subject. Best for FULL-OUTFIT REVEAL when the whole silhouette matters.
    - \`reveal\` — Detail pull-out (fabric drape, embroidery close-up unfurling). Best for CRAFTSMANSHIP-heavy pieces.
    - \`handheld-sway\` — Subtle organic camera movement. Best for EDITORIAL / natural feel.
    - \`static-hold\` — No camera movement, subject/fabric moves alone. Best for STATEMENT pieces with strong drape.

  **\`settingAtmosphere\` (optional, short free-text)** — ambient extras like "petals falling in soft light", "silk shifting in a gentle breeze", "candlelight flickers in background". Leave empty for clean.

  Match the mood + camera to the piece and the theme. A bridal kaftan for wedding season should NOT get \`studio-bright + slow-push\` (that's a product-tile look). It should get \`warm-golden + orbit\` or \`festive-vibrant + reveal\`. Vary these across the day's tasks so your queue doesn't feel monotonous.

# Return format

Return ONLY a JSON object matching this shape:

\`\`\`json
{
  "theme": "one-sentence strategic bet",
  "rationale": "why this theme, referencing specific intel signals",
  "contentMix": {
    "totalPosts": 4,
    "byPillar": { "product": 3, "inspiration": 1, "community": 0 }
  },
  "tasks": [
    {
      "platform": "FACEBOOK",
      "contentType": "IMAGE",
      "listingId": "<id from intel — required for image posts>",
      "hook": "4-8 word opener OR (for VIDEO) short cinematic instruction",
      "angle": "specific angle for THIS post",
      "pillar": "product",
      "priority": 1
    },
    {
      "platform": "INSTAGRAM_REEL",
      "contentType": "VIDEO",
      "listingId": "<id from intel>",
      "hook": "Model in ivory kaftan turning slowly, fabric flowing",
      "angle": "wedding-guest hero piece",
      "pillar": "product",
      "priority": 1,
      "visualMood": "warm-golden",
      "cameraMotion": "orbit",
      "settingAtmosphere": "silk shifting in a gentle breeze"
    }
  ]
}
\`\`\`

No prose before or after. JSON only.`;
}

function validatePlan(plan: MarketingPlan): void {
    if (!plan.theme || typeof plan.theme !== "string") {
        throw new Error("Plan missing theme");
    }
    if (!plan.rationale || typeof plan.rationale !== "string") {
        throw new Error("Plan missing rationale");
    }
    if (!plan.contentMix || typeof plan.contentMix.totalPosts !== "number") {
        throw new Error("Plan missing contentMix.totalPosts");
    }
    if (!Array.isArray(plan.tasks)) {
        throw new Error("Plan missing tasks[]");
    }
    const validPlatforms: MarketingPlatform[] = [
        "FACEBOOK",
        "INSTAGRAM_FEED",
        "INSTAGRAM_STORY",
        "INSTAGRAM_REEL",
        "TIKTOK",
    ];
    const validContentTypes: MarketingContentType[] = ["TEXT", "IMAGE", "VIDEO"];
    for (const [i, task] of plan.tasks.entries()) {
        if (!validPlatforms.includes(task.platform)) {
            throw new Error(`Plan task[${i}] has invalid platform: ${task.platform}`);
        }
        if (!validContentTypes.includes(task.contentType)) {
            throw new Error(`Plan task[${i}] has invalid contentType: ${task.contentType}`);
        }
        if (!task.hook || typeof task.hook !== "string") {
            throw new Error(`Plan task[${i}] missing hook`);
        }
        if (!task.angle || typeof task.angle !== "string") {
            throw new Error(`Plan task[${i}] missing angle`);
        }
    }
}
