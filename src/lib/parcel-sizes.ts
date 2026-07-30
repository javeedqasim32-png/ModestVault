// Category + style → Shippo parcel spec. Replaces the one-size-fits-all
// STANDARD_PARCEL for eligible listings so heavy items (bridal /formal
// abayas + dresses) quote at real weights instead of the 3-lb default —
// which was silently underweighting them and letting the carrier bill
// Modaire's Shippo balance weeks later at intake reweigh.
//
// Only Abayas and Dresses (and anything NOT in the excluded list) get
// style-based scaling. Kaftans / Sarees / Suits / Accessories always
// stay at the 3-lb default even when their style is Bridals — the
// physical logic being that a bridal kaftan is still just draped
// fabric, not layered/embroidered like a bridal abaya or dress.

import type { STANDARD_PARCEL } from "@/lib/shippo";

export type Parcel = typeof STANDARD_PARCEL;

// Categories that ALWAYS ship at the default parcel regardless of style.
// Anything not in this set is "eligible" for style-based scaling.
const EXCLUDED_CATEGORIES = new Set(["Accessories", "Kaftans", "Sarees", "Suits"]);

// Shared units + shape. Everything below just varies weight + dimensions.
const IN: "in" = "in";
const OZ: "oz" = "oz";

const DEFAULT_PARCEL: Parcel = {
    length: "14",
    width: "12",
    height: "5",
    distanceUnit: IN,
    weight: "48", // 3 lbs
    massUnit: OZ,
};

const BRIDALS_PARCEL: Parcel = {
    length: "16",
    width: "12",
    height: "6",
    distanceUnit: IN,
    weight: "80", // 5 lbs
    massUnit: OZ,
};

const FORMALS_PARCEL: Parcel = {
    length: "15",
    width: "12",
    height: "5",
    distanceUnit: IN,
    weight: "64", // 4 lbs
    massUnit: OZ,
};

// Shippo rejects boxes above these dims / weight — clamp defensive so a
// wild-outlier bundle (5+ bridal items) doesn't blow up rate lookup.
const CEILING_WEIGHT_OZ = 320; // 20 lbs
const CEILING_L_IN = 24;
const CEILING_W_IN = 20;
const CEILING_H_IN = 12;

/**
 * Resolve the Shippo parcel for a single listing. Category is checked first —
 * excluded categories short-circuit to the default. Only then does style
 * decide between Bridals / Formals / default.
 */
export function getParcelForListing(input: {
    category: string | null | undefined;
    style: string | null | undefined;
}): Parcel {
    if (input.category && EXCLUDED_CATEGORIES.has(input.category)) {
        return DEFAULT_PARCEL;
    }
    if (input.style === "Bridals") return BRIDALS_PARCEL;
    if (input.style === "Formals") return FORMALS_PARCEL;
    return DEFAULT_PARCEL;
}

/**
 * Bundle parcel: sum weights, take max of each dimension across items —
 * we're shipping ONE physical parcel, so the box has to be at least as
 * big as the largest item and heavy enough to carry all of them. Ceiling
 * clamps prevent runaway values on wild bundles.
 */
export function getParcelForBundle(
    items: Array<{ category: string | null | undefined; style: string | null | undefined }>,
): Parcel {
    if (items.length === 0) return DEFAULT_PARCEL;
    let totalWeight = 0;
    let maxL = 0;
    let maxW = 0;
    let maxH = 0;
    for (const item of items) {
        const p = getParcelForListing(item);
        totalWeight += Number(p.weight);
        maxL = Math.max(maxL, Number(p.length));
        maxW = Math.max(maxW, Number(p.width));
        maxH = Math.max(maxH, Number(p.height));
    }
    return {
        length: String(Math.min(maxL, CEILING_L_IN)),
        width: String(Math.min(maxW, CEILING_W_IN)),
        height: String(Math.min(maxH, CEILING_H_IN)),
        distanceUnit: IN,
        weight: String(Math.min(totalWeight, CEILING_WEIGHT_OZ)),
        massUnit: OZ,
    };
}
