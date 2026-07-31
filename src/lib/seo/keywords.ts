// Target keyword arrays — the single source of truth for what phrases
// we're optimizing to rank for. Google deprecated the meta-keywords tag
// years ago (has zero effect on rankings), so these are NOT emitted as
// <meta name="keywords">. Instead they're woven into page titles,
// descriptions, and body copy so Google's actual ranking signals
// (natural language matching) pick them up.
//
// Marketing team: edit this file when the keyword strategy changes.
// Downstream: buildPageMetadata() and per-page metadata definitions
// pull phrases from here to compose consistent, SEO-friendly copy.

// Broad brand + marketplace queries. Highest search volume, most
// competitive — reach comes from ranking well, but conversion may
// lag category-specific queries.
export const PRIMARY_KEYWORDS = [
    "modest fashion marketplace",
    "modest wear resale",
    "modest fashion resale",
    "buy modest wear online",
] as const;

// Garment / category level. Lower volume per phrase but much higher
// intent (someone searching "buy used kaftan" is ready to buy).
export const CATEGORY_KEYWORDS = [
    "buy used kaftans",
    "abaya resale",
    "hijab marketplace",
    "shalwar kameez resale",
    "preloved abayas",
    "preloved kaftans",
] as const;

// Cultural / regional. Modaire's core demo — Pakistani, South Asian,
// Desi buyers looking for occasion wear and everyday modest clothing.
export const CULTURAL_KEYWORDS = [
    "Pakistani bridal resale",
    "Pakistani wedding wear resale",
    "South Asian modest wear",
    "Indian bridal marketplace",
    "Desi fashion resale",
] as const;

// Value / sustainability angle. Growing niche — buyers who care about
// price + eco-impact often pick these phrases specifically.
export const VALUE_KEYWORDS = [
    "preloved modest wear",
    "sustainable modest fashion",
    "affordable bridal wear",
    "second-hand modest clothing",
] as const;

// Everything, deduped, for callers that want a full list (e.g. the
// homepage description that touches every angle at once).
export const ALL_KEYWORDS = [
    ...PRIMARY_KEYWORDS,
    ...CATEGORY_KEYWORDS,
    ...CULTURAL_KEYWORDS,
    ...VALUE_KEYWORDS,
] as const;
