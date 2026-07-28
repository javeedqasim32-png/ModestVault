// Preset listing-rejection reasons shown in the admin approval dropdown.
// Stored on Listing.rejection_reason as either the raw `value` key (for a
// preset pick) or as free-text (for OTHER, and for legacy rejections from
// before this dropdown existed). getListingRejectionMessage() resolves
// either shape into what the seller sees.

export const MODAIRE_LISTING_REJECTION_REASONS = [
    {
        value: "BETTER_PHOTOS",
        label: "Better Photos",
        message: "Please upload 3 clear, well-lit photos and resubmit.",
    },
    {
        value: "COVER_PHOTO",
        label: "Cover Photo",
        message: "Your cover photo needs to be recreated. Please resubmit.",
    },
    {
        value: "MISSING_INFORMATION",
        label: "Missing Information",
        message: "Please complete your listing details and resubmit.",
    },
    {
        value: "WRONG_CATEGORY",
        label: "Wrong Category",
        message: "Please update the category and resubmit.",
    },
    {
        value: "OTHER",
        label: "Other (write custom message)",
        message: null,
    },
] as const;

export type ListingRejectionReason =
    typeof MODAIRE_LISTING_REJECTION_REASONS[number]["value"];

export const DEFAULT_LISTING_REJECTION_REASON: ListingRejectionReason =
    "BETTER_PHOTOS";

export function isValidListingRejectionReason(
    value: unknown,
): value is ListingRejectionReason {
    return (
        typeof value === "string" &&
        MODAIRE_LISTING_REJECTION_REASONS.some((r) => r.value === value)
    );
}

// OTHER demands a custom note — enforced in the modal and on the server.
export function listingRejectionReasonRequiresNote(
    value: ListingRejectionReason,
): boolean {
    return value === "OTHER";
}

// Resolves whatever is stored on Listing.rejection_reason into the human
// message the seller should see. Handles three cases:
//   1. Preset KEY  → returns the canned message from the table above
//   2. OTHER custom text or legacy free-text → returns as-is
//   3. null / empty → returns empty string
export function getListingRejectionMessage(
    storedValue: string | null | undefined,
): string {
    if (!storedValue) return "";
    const preset = MODAIRE_LISTING_REJECTION_REASONS.find(
        (r) => r.value === storedValue && r.message !== null,
    );
    if (preset && preset.message) return preset.message;
    return storedValue;
}
