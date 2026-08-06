import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/api/admin-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/listings/[id]/images
 *
 * Returns every image on the listing in current display order. The
 * admin image-reorder screen renders these as a draggable grid; the
 * client sends back the new order via PUT below.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            images: {
                orderBy: { imageOrder: "asc" },
                select: {
                    id: true,
                    imageUrl: true,
                    thumbUrl: true,
                    mediumUrl: true,
                    imageOrder: true,
                },
            },
        },
    });
    if (!listing) return apiError("NOT_FOUND", "Listing not found.");

    return NextResponse.json({
        id: listing.id,
        title: listing.title,
        images: listing.images,
    });
}

const schema = z.object({
    imageIds: z.array(z.string().min(1)).min(1).max(20),
});

/**
 * PUT /api/v1/admin/listings/[id]/images
 *
 * Body: `{ imageIds: string[] }` — the full id list in the new order.
 * Mirrors updateListingImagesOrder: two-pass inside a transaction
 * (everything → negative orders first, then positive index) so the
 * unique (listingId, imageOrder) constraint never trips.
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = await parseJsonBody(req, schema);
    if (parsed instanceof NextResponse) return parsed;

    const { id } = await params;
    const listing = await prisma.listing.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!listing) return apiError("NOT_FOUND", "Listing not found.");

    await prisma.$transaction(async (tx) => {
        const existing = await tx.listingImage.findMany({
            where: { listingId: id },
            select: { id: true },
        });
        for (let i = 0; i < existing.length; i++) {
            await tx.listingImage.update({
                where: { id: existing[i].id },
                data: { imageOrder: -(i + 1) },
            });
        }
        for (let i = 0; i < parsed.imageIds.length; i++) {
            await tx.listingImage.update({
                where: { id: parsed.imageIds[i] },
                data: { imageOrder: i },
            });
        }
    });

    revalidatePath(`/listings/${id}`);
    revalidatePath("/");
    revalidatePath("/browse");

    return NextResponse.json({ success: true });
}
