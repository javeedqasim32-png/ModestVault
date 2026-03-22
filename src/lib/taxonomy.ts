const baseTaxonomy = {
    styles: ["Bridals", "Everyday", "Festive Pret", "Formals", "Modest Wear"],
    categories: {
        Abayas: [],
        Accessories: [
            "Bags",
            "Belts",
            "Dupattas",
            "Hair Accessories",
            "Hijabs",
            "Jewelry",
            "Pins"
        ],
        Dresses: [],
        Kaftans: [],
        Sarees: [],
        Suits: [
            "Anarkali",
            "Churidar",
            "Co-Ord Set",
            "Gharara",
            "Lehenga",
            "Shalwar Kameez",
            "Sharara"
        ]
    },
    types: {
        "Shalwar Kameez": ["2 Piece", "3 Piece"]
    }
} as const;

export const taxonomy = baseTaxonomy;

function sortAlpha(values: readonly string[]) {
    return [...values].sort((a, b) => a.localeCompare(b));
}

export function getStyles() {
    return sortAlpha(taxonomy.styles);
}

export function getCategories() {
    return sortAlpha(Object.keys(taxonomy.categories));
}

export function getSubcategories(category: string) {
    if (!category) return [];
    const subcategories = taxonomy.categories[category as keyof typeof taxonomy.categories];
    return subcategories ? sortAlpha(subcategories) : [];
}

export function getTypes(subcategory: string) {
    if (!subcategory) return [];
    const typeList = taxonomy.types[subcategory as keyof typeof taxonomy.types];
    return typeList ? sortAlpha(typeList) : [];
}

export function isValidStyle(style: string) {
    return taxonomy.styles.includes(style as (typeof taxonomy.styles)[number]);
}

export function isValidCategory(category: string) {
    return Object.prototype.hasOwnProperty.call(taxonomy.categories, category);
}

export function isValidSubcategory(category: string, subcategory: string) {
    if (!isValidCategory(category)) return false;
    const subcategories = taxonomy.categories[category as keyof typeof taxonomy.categories];
    return subcategories.includes(subcategory as never);
}

export function isValidType(subcategory: string, type: string) {
    const types = taxonomy.types[subcategory as keyof typeof taxonomy.types];
    if (!types) return false;
    return types.includes(type as never);
}

