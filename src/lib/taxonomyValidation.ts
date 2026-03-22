import {
    getSubcategories,
    getTypes,
    isValidCategory,
    isValidStyle,
    isValidSubcategory,
    isValidType,
} from "@/lib/taxonomy";

export type ListingTaxonomyInput = {
    style?: string | null;
    category?: string | null;
    subcategory?: string | null;
    type?: string | null;
};

export type ListingTaxonomyErrors = {
    style?: string;
    category?: string;
    subcategory?: string;
    type?: string;
};

export type ListingTaxonomyValidationResult =
    | {
        ok: true;
        normalized: {
            style: string;
            category: string;
            subcategory: string | null;
            type: string | null;
        };
    }
    | {
        ok: false;
        message: string;
        errors: ListingTaxonomyErrors;
    };

function normalize(value: string | null | undefined) {
    const trimmed = (value || "").trim();
    return trimmed.length ? trimmed : null;
}

function firstError(errors: ListingTaxonomyErrors) {
    return (
        errors.style ||
        errors.category ||
        errors.subcategory ||
        errors.type ||
        "Invalid listing taxonomy."
    );
}

export function validateListingTaxonomy(input: ListingTaxonomyInput): ListingTaxonomyValidationResult {
    const style = normalize(input.style);
    const category = normalize(input.category);
    const subcategory = normalize(input.subcategory);
    const type = normalize(input.type);
    const errors: ListingTaxonomyErrors = {};

    if (!style) {
        errors.style = "Style is required.";
    } else if (!isValidStyle(style)) {
        errors.style = "Please select a valid style.";
    }

    if (!category) {
        errors.category = "Category is required.";
    } else if (!isValidCategory(category)) {
        errors.category = "Please select a valid category.";
    }

    if (category && isValidCategory(category)) {
        const allowedSubcategories = getSubcategories(category);
        if (allowedSubcategories.length > 0) {
            if (!subcategory) {
                errors.subcategory = "Subcategory is required for this category.";
            } else if (!isValidSubcategory(category, subcategory)) {
                errors.subcategory = "Please select a valid subcategory for the chosen category.";
            }
        } else if (subcategory) {
            errors.subcategory = "Subcategory must be empty for this category.";
        }
    }

    if (subcategory) {
        const allowedTypes = getTypes(subcategory);
        if (allowedTypes.length > 0) {
            if (!type) {
                errors.type = "Type is required for this subcategory.";
            } else if (!isValidType(subcategory, type)) {
                errors.type = "Please select a valid type for the chosen subcategory.";
            }
        } else if (type) {
            errors.type = "Type must be empty for this subcategory.";
        }
    } else if (type) {
        errors.type = "Type must be empty when subcategory is not set.";
    }

    if (Object.keys(errors).length > 0) {
        return {
            ok: false,
            message: firstError(errors),
            errors,
        };
    }

    return {
        ok: true,
        normalized: {
            style: style as string,
            category: category as string,
            subcategory,
            type,
        },
    };
}

