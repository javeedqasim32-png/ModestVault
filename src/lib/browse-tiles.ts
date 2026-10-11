/**
 * The five style tiles and their artwork.
 *
 * These are `Listing.style` values, not categories — the naming is historical
 * (the home rail calls them "categories" in the UI). Filenames are the real
 * ones in /public: src/app/page.tsx once referenced un-suffixed names that
 * 404'd on mobile, so the source of truth lives here and both the home rail
 * and the search landing import it rather than keeping their own copies.
 */
export const STYLE_TILES: ReadonlyArray<{ name: string; image: string }> = [
    { name: "Western", image: "/category-everyday-blend.png" },
    { name: "Festive Pret", image: "/category-luxury-pret.png" },
    { name: "Formals", image: "/category-formal-wear.png" },
    { name: "Modest Wear", image: "/category-abayas.png" },
    { name: "Bridals", image: "/category-wedding.png" },
];

/**
 * Category tile artwork — line-art garment illustrations, warm brown on
 * cream, generated to match the app's palette.
 *
 * Categories have no photography of their own (the five category-*.png files
 * are all style shots). The first pass borrowed each category's newest
 * listing photo, which meant the row's look changed with inventory and read
 * as a random grid of product shots rather than a considered browse surface.
 * These are deliberate, consistent, and ~16KB each.
 *
 * Keys are `Listing.category` values — see src/lib/taxonomy.ts.
 */
export const CATEGORY_TILE_IMAGES: Readonly<Record<string, string>> = {
    Abayas: "/category-tile-abayas.webp",
    Accessories: "/category-tile-accessories.webp",
    Dresses: "/category-tile-dresses.webp",
    Kaftans: "/category-tile-kaftans.webp",
    Sarees: "/category-tile-sarees.webp",
    Suits: "/category-tile-suits.webp",
};
