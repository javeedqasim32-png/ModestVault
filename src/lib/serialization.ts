/**
 * Utility to convert Prisma Decimal objects to plain JavaScript numbers
 * for serialization to Client Components.
 */

export function serializeListing(listing: any) {
    if (!listing) return null;

    return {
        ...listing,
        price: listing.price ? Number(listing.price) : 0,
        // Recursively serialize nested images if they exist
        images: listing.images ? listing.images.map((img: any) => ({ ...img })) : [],
        // Convert dates to strings/ISOs if needed, though Next.js handles Dates pretty well now.
        // But for safety with complex objects:
        created_at: listing.created_at?.toISOString?.() || listing.created_at,
        updated_at: listing.updated_at?.toISOString?.() || listing.updated_at,
        reviewed_at: listing.reviewed_at?.toISOString?.() || listing.reviewed_at,
    };
}

export function serializePurchase(purchase: any) {
    if (!purchase) return null;

    return {
        ...purchase,
        amount: purchase.amount ? Number(purchase.amount) : 0,
        created_at: purchase.created_at?.toISOString?.() || purchase.created_at,
        listing: purchase.listing ? serializeListing(purchase.listing) : undefined,
        order: purchase.order ? { ...purchase.order } : undefined,
    };
}
