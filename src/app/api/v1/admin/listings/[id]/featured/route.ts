import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/api/admin-auth";
import { parseJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

const schema = z.object({ featured: z.boolean() });

/**
 * PUT /api/v1/admin/listings/[id]/featured
 *
 * Body: `{ featured: boolean }`. Mirrors setListingFeatured — pure
 * admin-side curation flip with no email, no notification, no
 * moderation_status change.
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
    const exists = await prisma.listing.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!exists) return apiError("NOT_FOUND", "Listing not found.");

    await prisma.listing.update({
        where: { id },
        data: { is_featured: parsed.featured },
    });
    return NextResponse.json({ success: true });
}
