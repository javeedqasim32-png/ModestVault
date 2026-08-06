import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/seller/drafts/[id]/publish
 *
 * Promotes a draft to a published Listing. Mirrors the validation in
 * `createListing` from src/app/actions/listings.ts — required fields
 * + at least one photo. Moderation status starts as PENDING (same as
 * the website flow), so admins still gate visibility.
 *
 * On success: creates Listing + ListingImage rows, deletes the draft,
 * returns the new listing id so the client can drop the user on the
 * detail page or back to the Sell tab.
 */
const REQUIRED_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "price", label: "Price" },
    { key: "style", label: "Style" },
    { key: "category", label: "Category" },
    { key: "condition", label: "Condition" },
    { key: "size", label: "Size" },
];

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft || draft.user_id !== principal.id) {
        return apiError("NOT_FOUND", "Draft not found.");
    }

    const missing: string[] = [];
    const fields: Record<string, string | null> = {
        title: draft.title,
        description: draft.description,
        price: draft.price,
        style: draft.style,
        category: draft.category,
        condition: draft.condition,
        size: draft.size,
    };
    for (const { key, label } of REQUIRED_FIELDS) {
        const v = fields[key];
        if (!v || !v.trim()) missing.push(label);
    }
    const allPhotos = [
        ...(draft.photo_urls ?? []),
        ...(draft.generated_image_urls ?? []),
    ];
    if (allPhotos.length === 0) missing.push("Photos");

    if (missing.length > 0) {
        return apiError(
            "INVALID_INPUT",
            `Please add: ${missing.join(", ")}.`,
        );
    }

    const priceNumber = Number(draft.price);
    if (Number.isNaN(priceNumber) || priceNumber <= 0) {
        return apiError("INVALID_INPUT", "Price must be a number greater than 0.");
    }

    const created = await prisma.$transaction(async (tx) => {
        const listing = await tx.listing.create({
            data: {
                user_id: principal.id,
                title: draft.title!,
                description: draft.description!,
                price: priceNumber,
                image_url: allPhotos[0],
                style: draft.style!,
                category: draft.category!,
                subcategory: draft.subcategory ?? null,
                type: draft.type ?? null,
                condition: draft.condition,
                brand: draft.brand,
                size: draft.size,
                status: "AVAILABLE",
                moderation_status: "PENDING",
            },
        });
        await tx.listingImage.createMany({
            data: allPhotos.map((url, idx) => ({
                listingId: listing.id,
                imageUrl: url,
                imageOrder: idx,
            })),
        });
        await tx.draft.delete({ where: { id } });
        return listing;
    });

    return NextResponse.json({
        listingId: created.id,
        moderationStatus: created.moderation_status,
    });
}
