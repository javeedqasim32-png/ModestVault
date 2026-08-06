import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { serializeListingSummaryForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

const Body = z.object({
    ids: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * POST /api/v1/listings/by-ids
 *
 * Hydrates a Recently Viewed list. The mobile client persists viewed
 * listing ids locally; on Home load it posts them here and gets back
 * full tile summaries for the ones that are still APPROVED + AVAILABLE.
 *
 * Results are returned in the same order as the input ids (most-recent
 * first), with rows that have been moderated-down silently dropped —
 * the client treats the response as authoritative and prunes its local
 * cache accordingly.
 *
 * Public (no Bearer required) since /browse is public.
 */
export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const rows = await prisma.listing.findMany({
        where: {
            id: { in: parsed.ids },
            status: "AVAILABLE",
            moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
        },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: {
                    imageUrl: true,
                    thumbUrl: true,
                    mediumUrl: true,
                    imageOrder: true,
                },
            },
        },
    });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = parsed.ids
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => r != null)
        .map(serializeListingSummaryForMobile);

    return NextResponse.json({ listings: ordered });
}
