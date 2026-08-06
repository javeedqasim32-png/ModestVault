import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

const MAX_LISTING_IMAGES = 6;

/// Each entry is one slot in the final ordered grid. Either a reference
/// to an existing listingImage row (`{kind:"existing", id}`) or a new
/// upload that just finished (`{kind:"new", imageUrl, thumbUrl?, mediumUrl?}`).
const EntrySchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("existing"),
        id: z.string().min(1),
    }),
    z.object({
        kind: z.literal("new"),
        imageUrl: z.string().min(1),
        thumbUrl: z.string().nullable().optional(),
        mediumUrl: z.string().nullable().optional(),
    }),
]);

const Body = z.object({
    order: z.array(EntrySchema).min(1).max(MAX_LISTING_IMAGES),
});

/**
 * PUT /api/v1/seller/listings/[id]/images
 *
 * Seller-side image replace — mobile equivalent of the website's
 * replaceListingImages server action. Body is the final ordered slot
 * list; the endpoint:
 *   1. Verifies ownership.
 *   2. Loads any "existing" entries to grab their stored URLs (the
 *      mobile client only sends ids back, not the full row).
 *   3. Transactionally deletes every listingImage row for this listing
 *      and recreates the new combined set with imageOrder = position.
 *   4. Updates `listing.image_url` to the first entry's URL.
 *   5. Flips `moderation_status` to PENDING so admin re-reviews the
 *      listing (photo changes are visible to buyers).
 *
 * Idempotent on the body — sending the same order twice produces the
 * same final state.
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const { id: listingId } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { user_id: true },
    });
    if (!listing) return apiError("NOT_FOUND", "Listing not found.");
    if (listing.user_id !== principal.id) {
        return apiError("FORBIDDEN", "You don't own this listing.");
    }

    // Hydrate "existing" entries from the DB. The mobile client only
    // echoes ids back, so we look them up here to get the original
    // imageUrl/thumbUrl/mediumUrl. Reject any id that isn't actually
    // part of this listing (defense against id confusion bugs).
    const existingIds = parsed.order
        .filter((e): e is { kind: "existing"; id: string } => e.kind === "existing")
        .map((e) => e.id);
    const existingRows = existingIds.length === 0
        ? []
        : await prisma.listingImage.findMany({
              where: { id: { in: existingIds }, listingId },
              select: { id: true, imageUrl: true, thumbUrl: true, mediumUrl: true },
          });
    if (existingRows.length !== existingIds.length) {
        return apiError(
            "INVALID_INPUT",
            "One or more image ids don't belong to this listing.",
        );
    }
    const existingById = new Map(existingRows.map((r) => [r.id, r]));

    const combinedData = parsed.order.map((entry, position) => {
        if (entry.kind === "existing") {
            const row = existingById.get(entry.id)!;
            return {
                id: row.id,
                listingId,
                imageUrl: row.imageUrl,
                thumbUrl: row.thumbUrl,
                mediumUrl: row.mediumUrl,
                imageOrder: position,
            };
        }
        return {
            id: randomUUID(),
            listingId,
            imageUrl: entry.imageUrl,
            thumbUrl: entry.thumbUrl ?? null,
            mediumUrl: entry.mediumUrl ?? null,
            imageOrder: position,
        };
    });

    const coverImage = combinedData[0]?.imageUrl;
    if (!coverImage) {
        return apiError("INVALID_INPUT", "No valid image was provided.");
    }

    await prisma.$transaction(async (tx) => {
        await tx.listingImage.deleteMany({ where: { listingId } });
        await tx.listingImage.createMany({ data: combinedData });
        await tx.listing.update({
            where: { id: listingId },
            data: {
                image_url: coverImage,
                moderation_status: "PENDING",
            },
        });
    });

    return NextResponse.json({ success: true });
}
