/**
 * Modaire's brand brief — the static "voice + goals" input the
 * Marketing Director feeds to every LLM call. Human-edited, no DB.
 *
 * ⚠ IMPORTANT: this file currently holds SENSIBLE DEFAULTS drafted by
 * Claude, not Qasim's actual preferences. Refine these to match your
 * actual voice — the Director's output quality is bounded by how well
 * this brief describes Modaire. Every line is fed verbatim into the
 * LLM system prompt.
 */

export const BRAND_BRIEF = {
    /** The one-sentence identity — what Modaire IS, not what it does. */
    identity:
        "Modaire is a curated, community-driven marketplace for modest women's fashion — abayas, kaftans, formal wear, and everyday modest pieces from real sellers' closets to yours.",

    /** 3-5 adjectives that describe how every post should feel. */
    voiceAdjectives: [
        "warm",
        "aspirational",
        "community-first",
        "understated",
        "editorial",
    ],

    /** Who Modaire is talking to. Specific = better copy. */
    targetAudience:
        "Modest fashion shoppers ages 25-45, US-based, primarily South Asian and Middle Eastern women who value modesty as a personal aesthetic choice. They shop for weddings, cultural celebrations (Eid, engagements, mehndi), and elevated everyday pieces. They care about fabric quality, authenticity, and buying from people rather than mass fast-fashion brands.",

    /** The single most important business goal — biases every trade-off. */
    topGoal: "Drive sales / revenue" as const,

    /** Content pillar ratios (must sum to 100). The Director's plan
     *  should approximate these across a week, not per single day. */
    contentPillars: {
        product: 60,      // listing spotlights, sale callouts, curated picks
        inspiration: 25,  // styling tips, "how to wear," outfit builds
        community: 15,    // seller stories, user-generated content, behind-the-scenes
    },

    /** Phrases + tones that always feel right. LLM learns from examples. */
    doSpeakLike: [
        "Handpicked from our community's closets.",
        "The Summer Edit.",
        "One-of-a-kind — when they're gone, they're gone.",
        "Curated modest pieces from real sellers.",
        "Fresh in the boutique this week.",
    ],

    /** Banned phrases. The Director will actively steer copy away. */
    doNotSay: [
        "shop now while supplies last",
        "limited time only!!!",
        "act fast",
        "unbeatable deals",
        // Competitor names
        "Modanisa",
        "Aab",
        "ASIYAM",
        "Poshmark",
        // Vague/hollow phrases
        "amazing quality",
        "best in the market",
        "you won't believe",
    ],

    /** Cultural/aesthetic touchpoints that resonate with the audience. */
    aestheticMarkers: {
        // Colors that read "Modaire" (also match the site's brand palette).
        colorPalette: ["espresso brown", "cream", "sand", "muted rose", "sage"],
        // Cultural references that show cultural literacy without cliché.
        culturalTouchpoints: ["Eid al-Adha", "Eid al-Fitr", "Ramadan iftars", "mehndi nights", "walima receptions", "cultural weddings"],
        // Words the brand voice returns to.
        signatureVocabulary: ["curated", "handpicked", "one-of-a-kind", "elevated", "modest", "editorial"],
    },

    /** How the brand thinks about pricing / value framing. */
    pricingPosture:
        "Modaire is affordable-luxury, not fast-fashion. Prices reflect the value of one-of-a-kind pieces from real sellers. Never apologize for a price; frame it as investment or discovery.",

    /** Website URL + call-to-action language variants for the LLM. */
    websiteUrl: "https://shopmodaire.com",
    ctaVariants: [
        "Shop the edit →",
        "Tap the bio to browse",
        "See the full sale on shopmodaire.com",
        "Discover one-of-a-kind pieces at shopmodaire.com",
    ],
} as const;

/**
 * Render the brief as a plain-text block the Director can embed in a
 * system prompt. Keeps the JSON structure above human-editable while
 * giving the LLM a clean text digest.
 */
export function renderBrandBriefForPrompt(): string {
    const b = BRAND_BRIEF;
    return `# Modaire Brand Brief

**Identity:** ${b.identity}

**Target audience:** ${b.targetAudience}

**Top business goal:** ${b.topGoal}

**Voice:** ${b.voiceAdjectives.join(", ")}

**Content pillar ratios (weekly target):**
- Product: ${b.contentPillars.product}%
- Inspiration: ${b.contentPillars.inspiration}%
- Community: ${b.contentPillars.community}%

**Speak like:**
${b.doSpeakLike.map((s) => `- "${s}"`).join("\n")}

**Never say:**
${b.doNotSay.map((s) => `- "${s}"`).join("\n")}

**Aesthetic markers:**
- Colors: ${b.aestheticMarkers.colorPalette.join(", ")}
- Cultural touchpoints: ${b.aestheticMarkers.culturalTouchpoints.join(", ")}
- Signature vocabulary: ${b.aestheticMarkers.signatureVocabulary.join(", ")}

**Pricing posture:** ${b.pricingPosture}

**Website:** ${b.websiteUrl}

**CTA variants to rotate:**
${b.ctaVariants.map((s) => `- "${s}"`).join("\n")}`;
}
