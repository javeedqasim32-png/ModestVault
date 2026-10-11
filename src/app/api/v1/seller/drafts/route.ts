import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { serializeDraftForMobile } from "@/lib/api/mobile-serializers";
import { buildS3ImageUrl, getS3BucketName } from "@/lib/s3";

export const dynamic = "force-dynamic";

/** Matches MAX_LISTING_IMAGES in src/app/actions/listings.ts. */
const MAX_LISTING_IMAGES = 6;

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
    // Photo arrays are a REORDER/REMOVE channel, not an upload one — see
    // the note in PUT below. Omit them to leave the stored arrays alone.
    photoUrls: z.array(z.string().max(2048)).max(MAX_LISTING_IMAGES).optional(),
    generatedImageUrls: z
        .array(z.string().max(2048))
        .max(MAX_LISTING_IMAGES)
        .optional(),
});

/**
 * Filters a client-supplied list down to photos that genuinely belong to
 * this draft, preserving the client's order and dropping duplicates.
 *
 * This endpoint is the ONLY writer of draft.photo_urls — /uploads/finalize
 * deliberately doesn't touch the row (see the note there) — so we can't
 * validate against what's already stored the way generated_image_urls does
 * below. Instead each URL is rebuilt from its key: a URL is accepted only
 * when it is byte-identical to what buildS3ImageUrl would produce for a key
 * inside `drafts/<userId>/<draftId>/`. That rejects both another seller's
 * photos and an arbitrary host smuggled in via a lookalike path, which a
 * plain prefix/`includes` check would let through.
 */
function ownDraftPhotos(
    requested: string[],
    userId: string,
    draftId: string,
): string[] {
    const bucket = getS3BucketName();
    const prefix = `drafts/${userId}/${draftId}/`;
    const kept: string[] = [];
    for (const url of requested) {
        // buildS3ImageUrl never emits a query or fragment; strip them so a
        // crafted suffix can't smuggle the key check past the comparison.
        const path = url.split(/[?#]/)[0];
        const at = path.lastIndexOf(prefix);
        if (at < 0) continue;
        const filename = path.slice(at + prefix.length);
        // One path segment — no traversal into a sibling draft.
        if (!filename || filename.includes("/")) continue;
        if (buildS3ImageUrl(prefix + filename, bucket) !== url) continue;
        if (!kept.includes(url)) kept.push(url);
    }
    return kept;
}

/**
 * Applies a client-supplied ordering to generated (AI cover) URLs.
 *
 * These still have a server-side writer — POST /drafts/[id]/attach-ai-cover
 * appends the worker's result — so filtering against what's stored is both
 * possible and the tightest check available: the AI result URL lives outside
 * the draft's own key namespace, so it can't be validated by path the way
 * uploaded photos are. The client may reorder and remove, never introduce.
 */
function applyOrdering(stored: string[] | null, requested: string[]): string[] {
    const allowed = new Set(stored ?? []);
    const kept: string[] = [];
    for (const url of requested) {
        if (allowed.has(url) && !kept.includes(url)) kept.push(url);
    }
    return kept;
}

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
 *
 * `photoUrls` / `generatedImageUrls` are optional and carry the seller's
 * REORDERING and REMOVALS of photos already attached to the draft — the
 * mobile grid lets them drag tiles around and delete them, and without
 * this the changes lived only in Flutter state and vanished on reopen (and
 * a removed photo still got published). Each array is filtered down to
 * URLs the draft already holds; see applyOrdering. Omit a field to leave
 * that array untouched, which is what the metadata-only saves (the
 * ghost-save before the first upload, and the pre-AI-generation snapshot)
 * rely on.
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
        const photoData = {
            // Validated by key ownership rather than against the stored
            // array, so this works on the very first save too — the row can
            // be created here already carrying its photos.
            ...(parsed.photoUrls && {
                photo_urls: {
                    set: ownDraftPhotos(parsed.photoUrls, principal.id, parsed.id),
                },
            }),
            // Reorder/remove only, so there has to be something stored to
            // reorder — meaningless on a row that doesn't exist yet.
            ...(existing &&
                parsed.generatedImageUrls && {
                    generated_image_urls: {
                        set: applyOrdering(
                            existing.generated_image_urls,
                            parsed.generatedImageUrls,
                        ),
                    },
                }),
        };

        const saved = existing
            ? await prisma.draft.update({
                  where: { id: parsed.id },
                  data: { ...data, ...photoData },
              })
            : await prisma.draft.create({
                  data: {
                      id: parsed.id,
                      user_id: principal.id,
                      ...data,
                      ...photoData,
                  },
              });
        return NextResponse.json({ draft: serializeDraftForMobile(saved) });
    }

    const created = await prisma.draft.create({
        data: { user_id: principal.id, ...data },
    });
    return NextResponse.json({ draft: serializeDraftForMobile(created) });
}
