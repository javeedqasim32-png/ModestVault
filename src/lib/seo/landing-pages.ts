// Landing-page copy + slug maps for /style/[slug] and /category/[slug].
// Each entry drives four surfaces:
//   1. title       — the browser tab + <title> tag (site suffix appended)
//   2. h1          — visible page heading (SEO-rich, keyword-native)
//   3. intro       — paragraph shown near the top of the page (body copy
//                    Google actually reads for ranking)
//   4. description — meta description tag (140-160 chars ideal)
//
// Slugs are kebab-case, lowercase — "Festive Pret" → "festive-pret".
// Taxonomy value stored on Listing.style / .category matches the
// original casing ("Festive Pret"), so we round-trip through the
// helpers below.

import { getCategories, getStyles } from "@/lib/taxonomy";

export type LandingPage = {
    slug: string;
    taxonomyValue: string; // matches Listing.style or .category
    title: string;
    h1: string;
    intro: string;
    description: string;
};

/**
 * "Festive Pret" → "festive-pret". Lowercase, spaces → hyphens.
 * Round-trip via findStyleBySlug / findCategoryBySlug.
 */
export function toSlug(value: string): string {
    return value.toLowerCase().replace(/\s+/g, "-");
}

// ─── STYLE LANDING PAGES ────────────────────────────────────────────

const STYLE_COPY: Record<string, Omit<LandingPage, "slug" | "taxonomyValue">> = {
    Bridals: {
        title: "Bridal Modest Wear",
        h1: "Preloved Bridal Modest Wear",
        intro:
            "Discover preloved and new Pakistani bridal wear, luxury lehengas, wedding shararas, and modest bridal outfits from Modaire's curated community. Sustainable, second-hand bridal fashion for South Asian weddings, mehendis, walimas, and formal occasions.",
        description:
            "Shop preloved Pakistani bridal wear, wedding lehengas, and modest bridal outfits on Modaire — the modest fashion marketplace for South Asian brides.",
    },
    Formals: {
        title: "Formal Modest Wear",
        h1: "Preloved Formal Modest Wear",
        intro:
            "Browse preloved formal abayas, dresses, and Pakistani formal wear on Modaire. Modest occasion-wear for engagements, dinners, and evening events — sustainable second-hand modest fashion at every budget.",
        description:
            "Preloved formal modest wear on Modaire — Pakistani formals, occasion abayas, and modest evening dresses. Sustainable second-hand modest fashion.",
    },
    "Festive Pret": {
        title: "Festive Pret Modest Wear",
        h1: "Festive Pret & Ready-to-Wear Modest Fashion",
        intro:
            "Ready-to-wear festive modest fashion on Modaire — preloved and new Pakistani pret pieces perfect for Eid, celebrations, and casual gatherings. Sustainable modest wear from a curated South Asian community.",
        description:
            "Festive pret ready-to-wear modest fashion on Modaire — preloved Pakistani pret pieces for Eid, celebrations, and everyday modest style.",
    },
    "Modest Wear": {
        title: "Everyday Modest Wear",
        h1: "Everyday Modest Wear",
        intro:
            "Everyday preloved modest clothing on Modaire — abayas, kaftans, hijabs, and modest tops for daily wear. Sustainable, affordable modest fashion for every wardrobe.",
        description:
            "Everyday preloved modest clothing on Modaire — abayas, kaftans, hijabs, and modest wear for daily style. Sustainable and affordable.",
    },
    Western: {
        title: "Modest Western Wear",
        h1: "Modest Western Wear",
        intro:
            "Modest western fashion on Modaire — preloved dresses, tops, and layered outfits that meet modest coverage standards. Sustainable second-hand western fashion for the modest wardrobe.",
        description:
            "Modest western fashion on Modaire — preloved modest dresses and western outfits with full coverage. Sustainable and secondhand.",
    },
};

export const STYLE_LANDING_PAGES: LandingPage[] = getStyles()
    .map((style) => {
        const copy = STYLE_COPY[style];
        if (!copy) return null;
        return {
            slug: toSlug(style),
            taxonomyValue: style,
            ...copy,
        } satisfies LandingPage;
    })
    .filter((p): p is LandingPage => p !== null);

export function findStyleBySlug(slug: string): LandingPage | null {
    const normalized = slug.toLowerCase();
    return STYLE_LANDING_PAGES.find((p) => p.slug === normalized) ?? null;
}

// ─── CATEGORY LANDING PAGES ─────────────────────────────────────────

const CATEGORY_COPY: Record<string, Omit<LandingPage, "slug" | "taxonomyValue">> = {
    Abayas: {
        title: "Preloved Abayas",
        h1: "Preloved & New Abayas",
        intro:
            "Shop preloved and new abayas on Modaire — from everyday cotton abayas to formal embroidered pieces and bridal abayas. Sustainable modest fashion from a curated community of sellers.",
        description:
            "Preloved abayas on Modaire — everyday, formal, and bridal abayas. Buy sustainable modest wear from a curated South Asian community.",
    },
    Kaftans: {
        title: "Preloved Kaftans",
        h1: "Preloved & New Kaftans",
        intro:
            "Buy used kaftans on Modaire — everyday cotton kaftans, silk kaftans, and formal embroidered kaftans from our community of sellers. Sustainable modest fashion at every price point.",
        description:
            "Buy used kaftans on Modaire — silk, cotton, and embroidered kaftans. Preloved modest wear from a curated community.",
    },
    Dresses: {
        title: "Modest Dresses",
        h1: "Modest Dresses — Preloved & New",
        intro:
            "Modest dresses on Modaire — maxi dresses, formal dresses, and modest western dresses with full coverage. Sustainable, secondhand modest fashion at every budget.",
        description:
            "Preloved modest dresses on Modaire — maxi dresses, formal, and western modest styles. Sustainable secondhand modest fashion.",
    },
    Sarees: {
        title: "Preloved Sarees",
        h1: "Preloved Sarees & Bridal Sarees",
        intro:
            "Preloved sarees on Modaire — everyday sarees, silk sarees, and bridal sarees from the South Asian community. Sustainable second-hand sarees at every price point.",
        description:
            "Preloved sarees on Modaire — silk sarees, bridal sarees, and everyday sarees from South Asian sellers. Sustainable secondhand.",
    },
    Suits: {
        title: "Preloved Shalwar Kameez & Suits",
        h1: "Shalwar Kameez, Lehengas & Suits",
        intro:
            "Shop preloved shalwar kameez, lehengas, gharara, sharara, anarkali, and Pakistani suits on Modaire — 2 piece, 3 piece, and formal suits from a curated South Asian community. Sustainable modest wear.",
        description:
            "Preloved shalwar kameez, lehengas, gharara, sharara, and Pakistani suits on Modaire — sustainable modest wear from a curated community.",
    },
    Accessories: {
        title: "Modest Accessories",
        h1: "Hijabs, Bags & Modest Accessories",
        intro:
            "Modest fashion accessories on Modaire — hijabs, dupattas, bags, jewelry, belts, and hair accessories. Preloved and new accessories from a curated South Asian community.",
        description:
            "Modest accessories on Modaire — hijabs, dupattas, bags, and jewelry. Preloved and new modest fashion accessories.",
    },
};

export const CATEGORY_LANDING_PAGES: LandingPage[] = getCategories()
    .map((category) => {
        const copy = CATEGORY_COPY[category];
        if (!copy) return null;
        return {
            slug: toSlug(category),
            taxonomyValue: category,
            ...copy,
        } satisfies LandingPage;
    })
    .filter((p): p is LandingPage => p !== null);

export function findCategoryBySlug(slug: string): LandingPage | null {
    const normalized = slug.toLowerCase();
    return CATEGORY_LANDING_PAGES.find((p) => p.slug === normalized) ?? null;
}

// ─── FLAT LIST FOR SITEMAP ──────────────────────────────────────────

export const ALL_LANDING_PAGES: Array<{ path: string; page: LandingPage }> = [
    ...STYLE_LANDING_PAGES.map((page) => ({ path: `/style/${page.slug}`, page })),
    ...CATEGORY_LANDING_PAGES.map((page) => ({ path: `/category/${page.slug}`, page })),
];
