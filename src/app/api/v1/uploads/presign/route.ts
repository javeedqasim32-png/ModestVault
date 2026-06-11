import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { requireBearer } from "@/lib/api/bearer-auth";
import { buildS3ImageUrl, getPresignedPutUrl, getS3BucketName } from "@/lib/s3";

export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const EXT_FOR_CONTENT_TYPE: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
};

const Body = z.object({
    purpose: z.enum(["draft", "ai-ref", "profile", "message"]),
    contentType: z.enum(ALLOWED_CONTENT_TYPES),
    /** Only for purpose=draft — owning draft id (must belong to caller). */
    draftId: z.string().min(1).max(64).optional(),
    /** Only for purpose=ai-ref — slot label (fullOutfit/top/bottom/dupatta/closeup). */
    slot: z.enum(["fullOutfit", "top", "bottom", "dupatta", "closeup"]).optional(),
    /** Optional client hint about the source filename — used only for logging. */
    filename: z.string().max(255).optional(),
});

/**
 * POST /api/v1/uploads/presign
 *
 * Issues a short-lived presigned PUT URL that the mobile client uses to push
 * an image directly to S3, bypassing Next.js for the file bytes. Server-side
 * normalization happens later, on /api/v1/uploads/finalize.
 *
 * The key is server-derived from {purpose, userId, draftId/slot, uuid} so the
 * client can't pick an arbitrary path and write outside its namespace. The
 * client receives the key back and echoes it on finalize.
 *
 * Response:
 *   200 { key, uploadUrl, expiresAt, publicUrl }
 *     - publicUrl is the eventual GETtable URL the client will see for this
 *       object once it's uploaded (handy for optimistic UI).
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const bucket = getS3BucketName();
    if (!bucket) return apiError("UNAVAILABLE", "S3 bucket is not configured.");

    const ext = EXT_FOR_CONTENT_TYPE[parsed.contentType];
    const userId = principal.id;
    let key: string;

    switch (parsed.purpose) {
        case "draft": {
            if (!parsed.draftId) {
                return apiError("INVALID_INPUT", "draftId is required for purpose=draft.", { draftId: "Required" });
            }
            // Verify ownership before we hand out an upload URL — prevents a
            // malicious client from staging photos into another seller's draft
            // namespace.
            const draft = await prisma.draft.findUnique({
                where: { id: parsed.draftId },
                select: { user_id: true },
            });
            if (!draft || draft.user_id !== userId) {
                return apiError("NOT_FOUND", "Draft not found.");
            }
            key = `drafts/${userId}/${parsed.draftId}/${randomUUID()}.${ext}`;
            break;
        }
        case "ai-ref": {
            // AI cover references — the slot label is part of the key so the
            // worker (which parses slot from the filename) keeps working
            // regardless of how the row was created.
            if (!parsed.slot) {
                return apiError("INVALID_INPUT", "slot is required for purpose=ai-ref.", { slot: "Required" });
            }
            key = `ai-refs/${userId}/${randomUUID()}-${parsed.slot}.png`;
            break;
        }
        case "profile": {
            key = `profiles/${userId}/${randomUUID()}.${ext}`;
            break;
        }
        case "message": {
            key = `messages/${userId}/${randomUUID()}.${ext}`;
            break;
        }
    }

    const presigned = await getPresignedPutUrl(key, parsed.contentType, bucket);
    return NextResponse.json({
        key,
        uploadUrl: presigned.uploadUrl,
        expiresAt: presigned.expiresAt.toISOString(),
        publicUrl: buildS3ImageUrl(key, bucket),
    });
}
