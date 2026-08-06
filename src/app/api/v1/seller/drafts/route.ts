import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { serializeDraftForMobile } from "@/lib/api/mobile-serializers";

export const dynamic = "force-dynamic";

const DraftBody = z.object({
    id: z.string().uuid().optional(),
    title: z.string().max(120).optional(),
    style: z.string().max(80).optional(),
    category: z.string().max(80).optional(),
    subcategory: z.string().max(80).optional(),
    type: z.string().max(80).optional(),
    price: z.string().max(20).optional(),
    brand: z.string().max(80).optional(),
    description: z.string().max(5000).optional(),
    condition: z.string().max(40).optional(),
    size: z.string().max(20).optional(),
    measurements: z.string().max(2000).optional(),
});

/**
 * GET /api/v1/seller/drafts
 *
 * In-progress listing drafts owned by the calling user, most-recently-
 * updated first. Powers the Drafts tab on the mobile Sell screen and
 * lets the user resume editing where they left off.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await (prisma as any).draft.findMany({
        where: { user_id: principal.id },
        orderBy: { updated_at: "desc" },
    });

    return NextResponse.json({
        drafts: rows.map(serializeDraftForMobile),
    });
}

/**
 * PUT /api/v1/seller/drafts
 *
 * Upserts a draft. The client generates the draft id up-front (uuid) so
 * it can upload photos to drafts/<userId>/<draftId>/ on S3 before the DB
 * row exists — the upload-finalize endpoint then appends the resulting
 * URLs to draft.photo_urls. PUT here saves the form metadata around
 * those photos. Idempotent: same body posted twice produces the same
 * row.
 *
 * If the id matches an existing draft owned by another user, returns
 * NOT_FOUND (treating it as "doesn't exist for you") to avoid leaking
 * the existence of other users' ids.
 */
export async function PUT(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, DraftBody);
    if (parsed instanceof NextResponse) return parsed;

    const data = {
        title: parsed.title?.trim() || null,
        style: parsed.style?.trim() || null,
        category: parsed.category?.trim() || null,
        subcategory: parsed.subcategory?.trim() || null,
        type: parsed.type?.trim() || null,
        price: parsed.price?.trim() || null,
        brand: parsed.brand?.trim() || null,
        description: parsed.description?.trim() || null,
        condition: parsed.condition?.trim() || null,
        size: parsed.size?.trim() || null,
        measurements: parsed.measurements?.trim() || null,
    };

    if (parsed.id) {
        const existing = await prisma.draft.findUnique({
            where: { id: parsed.id },
        });
        if (existing && existing.user_id !== principal.id) {
            return apiError("NOT_FOUND", "Draft not found.");
        }
        const saved = existing
            ? await prisma.draft.update({ where: { id: parsed.id }, data })
            : await prisma.draft.create({
                  data: {
                      id: parsed.id,
                      user_id: principal.id,
                      ...data,
                  },
              });
        return NextResponse.json({ draft: serializeDraftForMobile(saved) });
    }

    const created = await prisma.draft.create({
        data: { user_id: principal.id, ...data },
    });
    return NextResponse.json({ draft: serializeDraftForMobile(created) });
}
