import type { GeneratedCopy, MarketingPlatform } from "../types";

/**
 * CopyAgent — one LLM call → platform-tuned caption + hashtags.
 *
 * Uses OpenAI directly via fetch (matching the pattern in
 * src/lib/ai-cover-worker.ts). Model is gpt-4o-mini — cheap, fast,
 * plenty smart for social captions. Never throws — returns a
 * conservative fallback caption so the whole pipeline doesn't stall
 * on one LLM hiccup. The admin will edit anyway before approving.
 */
export async function generateCopy(input: {
    platform: MarketingPlatform;
    listing: {
        title: string;
        description: string;
        price: number;
        category: string;
        brand?: string | null;
        size?: string | null;
    };
    /** Director's strategic framing this post fits into. Weaves through
     *  every post in a coordinated day. */
    theme?: string;
    /** Director-chosen sharp opener the copy should lead with. */
    hook?: string;
    /** Per-post strategic angle (subset of theme). */
    angle?: string;
    /** Content pillar — helps CopyAgent tune tone. */
    pillar?: "product" | "inspiration" | "community";
}): Promise<GeneratedCopy> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return fallbackCopy(input);
    }

    const systemPrompt = buildSystemPrompt(input.platform);
    const userPrompt = buildUserPrompt(input);

    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                response_format: { type: "json_object" },
                temperature: 0.8,
                max_tokens: 400,
            }),
        });
        if (!res.ok) {
            console.error("[CopyAgent] OpenAI non-ok:", res.status);
            return fallbackCopy(input);
        }
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return fallbackCopy(input);
        const parsed = JSON.parse(content) as { caption?: string; hashtags?: string };
        return {
            caption: (parsed.caption ?? "").trim() || fallbackCopy(input).caption,
            hashtags: (parsed.hashtags ?? "").trim() || fallbackCopy(input).hashtags,
        };
    } catch (err) {
        console.error("[CopyAgent] error:", err);
        return fallbackCopy(input);
    }
}

function buildSystemPrompt(platform: MarketingPlatform): string {
    const base = `You write short social captions for Modaire — a peer-to-peer marketplace for modest, curated women's fashion (abayas, shalwar kameez, formal wear, everyday modest pieces). Voice: warm, aspirational, human. Never salesy. Never emoji-spam. Always in JSON with keys "caption" and "hashtags".`;
    switch (platform) {
        case "FACEBOOK":
            return `${base}\nFacebook feed: 2-3 sentences. Lead with a hook (something surprising, personal, or beautiful about the piece). Include the price naturally. End with a link CTA: "Shop it → shopmodaire.com". Hashtags optional, 0-4 max.`;
        case "INSTAGRAM_FEED":
            return `${base}\nInstagram feed: 1-2 sentences (IG readers scroll fast). Evocative and visual. Price naturally. CTA line: "Tap the bio link to shop." Hashtags: 6-10 relevant fashion/modest-wear tags, no #ad, no #shopmodaire (owner's own tag not needed here — add it separately below).`;
        case "INSTAGRAM_STORY":
            return `${base}\nInstagram Story overlay text: extremely short (10 words max, single line preferred). Big, punchy. Price. "Tap up →" or similar swipe CTA. Hashtags: 0.`;
        case "INSTAGRAM_REEL":
            return `${base}\nInstagram Reel caption: 2-3 lines. Hook + product tease + link CTA "Tap the bio to shop". Hashtags: 8-12 relevant tags.`;
        case "TIKTOK":
            return `${base}\nTikTok caption: <150 characters, punchy hook, gen-z-adjacent but not cringe. Do NOT mention "buy" directly — "grab yours" or "shop the link" fits better. Hashtags: 4-8 trend-relevant + niche.`;
    }
}

function buildUserPrompt(input: {
    platform: MarketingPlatform;
    listing: {
        title: string;
        description: string;
        price: number;
        category: string;
        brand?: string | null;
        size?: string | null;
    };
    theme?: string;
    hook?: string;
    angle?: string;
    pillar?: "product" | "inspiration" | "community";
}): string {
    const { listing, theme, hook, angle, pillar } = input;
    const brandLine = listing.brand ? `Brand: ${listing.brand}` : "Brand: independent";
    const sizeLine = listing.size ? `Size: ${listing.size}` : "";
    // Director context takes precedence — the CopyAgent's job is to
    // execute the plan, not invent a fresh angle.
    const themeLine = theme ? `Today's marketing theme (weave into the caption): ${theme}` : "";
    const hookLine = hook ? `Sharpest opener to lead with: "${hook}"` : "";
    const angleLine = angle ? `Strategic angle for this specific post: ${angle}` : "";
    const pillarLine = pillar ? `Content pillar: ${pillar} (${pillarGuidance(pillar)})` : "";
    return [
        `Write a caption for this listing:`,
        `Title: ${listing.title}`,
        `Category: ${listing.category}`,
        brandLine,
        sizeLine,
        `Price: $${listing.price.toFixed(2)}`,
        `Description: ${listing.description.slice(0, 400)}`,
        themeLine,
        hookLine,
        angleLine,
        pillarLine,
        ``,
        `Return JSON: {"caption": "...", "hashtags": "#tag1 #tag2 ..."}`,
    ].filter(Boolean).join("\n");
}

function pillarGuidance(pillar: "product" | "inspiration" | "community"): string {
    switch (pillar) {
        case "product":
            return "spotlight this specific piece; lead with product story + price";
        case "inspiration":
            return "styling-focused; use the piece as an example within a broader 'how to wear' angle";
        case "community":
            return "the piece is context; center the seller, story, or community moment";
    }
}

function fallbackCopy(input: {
    platform: MarketingPlatform;
    listing: { title: string; price: number };
}): GeneratedCopy {
    const price = `$${input.listing.price.toFixed(2)}`;
    return {
        caption: `${input.listing.title} — ${price}. Shop it at shopmodaire.com`,
        hashtags: "#modestfashion #shopmodaire",
    };
}
