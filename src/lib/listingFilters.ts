import { Prisma } from "@prisma/client";
import { getCategories, getStyles, getSubcategories, getTypes, isValidCategory, isValidSubcategory } from "@/lib/taxonomy";

export type ListingBrowseFilters = {
    search: string;
    styles: string[];
    categories: string[];
    subcategories: string[];
    types: string[];
    sizes: string[];
    minPrice?: number;
    maxPrice?: number;
};

export type ListingFilterOptionSets = {
    styles: string[];
    categories: string[];
    subcategories: string[];
    types: string[];
    sizes: string[];
};

type ListingMetaForOptions = {
    style: string | null;
    category: string | null;
    subcategory: string | null;
    type: string | null;
    size: string | null;
};

export const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

function unique(values: string[]) {
    return [...new Set(values)];
}

function parseCsvOrMulti(value: string | string[] | undefined) {
    if (!value) return [];
    const chunks = Array.isArray(value) ? value : [value];
    return chunks
        .flatMap((chunk) => chunk.split(","))
        .map((v) => v.trim())
        .filter(Boolean);
}

function alpha(values: string[]) {
    return [...values].sort((a, b) => a.localeCompare(b));
}

export function parseBrowseFilters(searchParams: Record<string, string | string[] | undefined>): ListingBrowseFilters {
    const searchRaw = searchParams.search;
    const search = (Array.isArray(searchRaw) ? searchRaw[0] : searchRaw || "").trim();

    const styles = unique(parseCsvOrMulti(searchParams.styles)).filter((style) => getStyles().includes(style));
    const categories = unique(parseCsvOrMulti(searchParams.categories)).filter((category) => isValidCategory(category));
    const subcategories = unique(parseCsvOrMulti(searchParams.subcategories)).filter((subcategory) => {
        if (categories.length === 0) return true;
        return categories.some((category) => isValidSubcategory(category, subcategory));
    });
    const types = unique(parseCsvOrMulti(searchParams.types));
    const sizes = unique(parseCsvOrMulti(searchParams.sizes));

    const minPriceRaw = Array.isArray(searchParams.minPrice) ? searchParams.minPrice[0] : searchParams.minPrice;
    const maxPriceRaw = Array.isArray(searchParams.maxPrice) ? searchParams.maxPrice[0] : searchParams.maxPrice;
    const minCandidate = minPriceRaw ? Number(minPriceRaw) : undefined;
    const maxCandidate = maxPriceRaw ? Number(maxPriceRaw) : undefined;

    const minPrice = Number.isFinite(minCandidate) ? minCandidate : undefined;
    const maxPrice = Number.isFinite(maxCandidate) ? maxCandidate : undefined;

    return {
        search,
        styles,
        categories,
        subcategories,
        types,
        sizes,
        minPrice,
        maxPrice,
    };
}

export function buildListingBrowseWhere(filters: ListingBrowseFilters): Prisma.ListingWhereInput {
    const hasMinPrice = typeof filters.minPrice === "number" && Number.isFinite(filters.minPrice);
    const hasMaxPrice = typeof filters.maxPrice === "number" && Number.isFinite(filters.maxPrice);
    const search = filters.search.trim();

    return {
        status: "AVAILABLE",
        moderation_status: "APPROVED",
        ...(search
            ? {
                OR: [
                    { title: { contains: search, mode: "insensitive" } },
                    { description: { contains: search, mode: "insensitive" } },
                    { brand: { contains: search, mode: "insensitive" } },
                    { style: { contains: search, mode: "insensitive" } },
                    { category: { contains: search, mode: "insensitive" } },
                    { subcategory: { contains: search, mode: "insensitive" } },
                    { type: { contains: search, mode: "insensitive" } },
                ],
            }
            : {}),
        ...(filters.styles.length > 0 ? { style: { in: filters.styles } } : {}),
        ...(filters.categories.length > 0 ? { category: { in: filters.categories } } : {}),
        ...(filters.subcategories.length > 0 ? { subcategory: { in: filters.subcategories } } : {}),
        ...(filters.types.length > 0 ? { type: { in: filters.types } } : {}),
        ...(filters.sizes.length > 0 ? { size: { in: filters.sizes, mode: "insensitive" } } : {}),
        ...(hasMinPrice || hasMaxPrice
            ? {
                price: {
                    ...(hasMinPrice ? { gte: filters.minPrice } : {}),
                    ...(hasMaxPrice ? { lte: filters.maxPrice } : {}),
                },
            }
            : {}),
    };
}

function orderSizes(values: string[]) {
    const upperMap = new Map(SIZE_ORDER.map((size, index) => [size.toUpperCase(), index]));
    return [...values].sort((a, b) => {
        const aIndex = upperMap.get(a.toUpperCase());
        const bIndex = upperMap.get(b.toUpperCase());
        if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
        if (aIndex !== undefined) return -1;
        if (bIndex !== undefined) return 1;
        return a.localeCompare(b);
    });
}

export function getAvailableFilterOptions(
    listings: ListingMetaForOptions[],
    selected: Pick<ListingBrowseFilters, "categories" | "subcategories">
): ListingFilterOptionSets {
    const stylesFromInventory = new Set(
        listings.map((item) => item.style).filter((value): value is string => Boolean(value))
    );
    const categoriesFromInventory = new Set(
        listings.map((item) => item.category).filter((value): value is string => Boolean(value))
    );
    const subcategoriesFromInventory = new Set(
        listings.map((item) => item.subcategory).filter((value): value is string => Boolean(value))
    );
    const typesFromInventory = new Set(
        listings.map((item) => item.type).filter((value): value is string => Boolean(value))
    );
    const sizesFromInventory = new Set(
        listings.map((item) => item.size).filter((value): value is string => Boolean(value))
    );

    const styleOptions = getStyles().filter((style) => stylesFromInventory.has(style));
    const categoryOptions = getCategories().filter((category) => categoriesFromInventory.has(category));

    const subcategoryTaxonomyPool = selected.categories.length > 0
        ? selected.categories.flatMap((category) => getSubcategories(category))
        : getCategories().flatMap((category) => getSubcategories(category));
    const subcategoryOptions = alpha(unique(subcategoryTaxonomyPool)).filter((subcategory) => subcategoriesFromInventory.has(subcategory));

    const typeTaxonomyPool = selected.subcategories.length > 0
        ? selected.subcategories.flatMap((subcategory) => getTypes(subcategory))
        : subcategoryOptions.flatMap((subcategory) => getTypes(subcategory));
    const typeOptions = alpha(unique(typeTaxonomyPool)).filter((type) => typesFromInventory.has(type));

    return {
        styles: styleOptions,
        categories: categoryOptions,
        subcategories: subcategoryOptions,
        types: typeOptions,
        sizes: orderSizes([...sizesFromInventory]),
    };
}

export function hasActiveBrowseFilters(filters: ListingBrowseFilters) {
    return Boolean(
        filters.search ||
        filters.styles.length ||
        filters.categories.length ||
        filters.subcategories.length ||
        filters.types.length ||
        filters.sizes.length ||
        typeof filters.minPrice === "number" ||
        typeof filters.maxPrice === "number"
    );
}

export function toBrowseQueryString(filters: ListingBrowseFilters) {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.styles.length > 0) params.set("styles", filters.styles.join(","));
    if (filters.categories.length > 0) params.set("categories", filters.categories.join(","));
    if (filters.subcategories.length > 0) params.set("subcategories", filters.subcategories.join(","));
    if (filters.types.length > 0) params.set("types", filters.types.join(","));
    if (filters.sizes.length > 0) params.set("sizes", filters.sizes.join(","));
    if (typeof filters.minPrice === "number") params.set("minPrice", String(filters.minPrice));
    if (typeof filters.maxPrice === "number") params.set("maxPrice", String(filters.maxPrice));
    return params.toString();
}

