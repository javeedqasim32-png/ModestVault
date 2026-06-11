import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { requireBearer } from "@/lib/api/bearer-auth";
import { buildS3ImageUrl, downloadFile, getS3BucketName, uploadFile } from "@/lib/s3";

export const dynamic = "force-dynamic";

const Body = z.object({
    key: z.string().min(1).max(512),
    purpose: z.enum(["draft", "profile", "message"]),
});

/**
 * POST /api/v1/uploads/finalize
 *
 * Called by the mobile client after a successful PUT to the presigned URL.
 * Responsibilities by purpose:
 *
 *   draft   – generate -thumb.webp (300px) + -medium.webp (800px) variants,
 *             add the original URL to the seller's draft.photo_urls array,
 *             return all three URLs.
 *   profile – generate a 512px square thumb, set user.profile_image to the
 *             thumb URL, return it.
 *   message – no normalization (messages already display original-quality
 *             attachments); just return the URL.
 *
 * AI cover references (purpose=ai-ref) DO NOT need finalize — the AI worker
 * downloads them as-is. The presign route is the only ai-ref step.
 *
 * Ownership: the key MUST start with `{prefix}/{principal.id}/`. Anything
 * else is rejected.
 *
 * Response:
 *   200 { imageUrl, thumbUrl?, mediumUrl? }
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const bucket = getS3BucketName();
    if (!bucket) return apiError("UNAVAILABLE", "S3 bucket is not configured.");

    const expectedPrefix = `${parsed.purpose === "draft" ? "drafts" : parsed.purpose === "profile" ? "profiles" : "messages"}/${principal.id}/`;
    if (!parsed.key.startsWith(expectedPrefix)) {
        return apiError("FORBIDDEN", "Cannot finalize this upload.");
    }

    const buffer = await downloadFile(parsed.key, bucket);
    if (!buffer) return apiError("NOT_FOUND", "Upload did not complete — please retry.");

    const imageUrl = buildS3ImageUrl(parsed.key, bucket);

    if (parsed.purpose === "message") {
        return NextResponse.json({ imageUrl });
    }

    if (parsed.purpose === "profile") {
        const thumbKey = parsed.key.replace(/\.[a-z0-9]+$/i, "-thumb.webp");
        try {
            const thumbBuffer = await sharp(buffer)
                .rotate()
                .resize({ width: 512, height: 512, fit: "cover" })
                .webp({ quality: 82, effort: 4 })
                .toBuffer();
            await uploadFile(thumbBuffer, thumbKey, "image/webp", bucket);
        } catch (err) {
            console.warn("[uploads/finalize] profile thumb failed", err);
        }
        const thumbUrl = buildS3ImageUrl(thumbKey, bucket);
        await prisma.user.update({
            where: { id: principal.id },
            data: { profile_image: thumbUrl },
        });
        return NextResponse.json({ imageUrl: thumbUrl });
    }

    // purpose === "draft" — mirrors the variants the legacy uploadImagesForListing
    // pipeline in src/app/actions/listings.ts produces.
    const draftId = parsed.key.split("/")[2]; // drafts/<userId>/<draftId>/<file>
    if (!draftId) return apiError("INVALID_INPUT", "Malformed draft key.");

    const draft = await prisma.draft.findUnique({
        where: { id: draftId },
        select: { user_id: true, photo_urls: true },
    });
    if (!draft || draft.user_id !== principal.id) {
        return apiError("NOT_FOUND", "Draft not found.");
    }

    const baseKey = parsed.key.replace(/\.[a-z0-9]+$/i, "");
    const thumbKey = `${baseKey}-thumb.webp`;
    const mediumKey = `${baseKey}-medium.webp`;

    let thumbUrl: string | null = null;
    let mediumUrl: string | null = null;
    try {
        const thumbBuffer = await sharp(buffer)
            .rotate()
            .resize({ width: 300, withoutEnlargement: true })
            .webp({ quality: 78, effort: 4 })
            .toBuffer();
        await uploadFile(thumbBuffer, thumbKey, "image/webp", bucket);
        thumbUrl = buildS3ImageUrl(thumbKey, bucket);
    } catch (err) {
        console.warn("[uploads/finalize] draft thumb failed", err);
    }
    try {
        const mediumBuffer = await sharp(buffer)
            .rotate()
            .resize({ width: 800, withoutEnlargement: true })
            .webp({ quality: 82, effort: 4 })
            .toBuffer();
        await uploadFile(mediumBuffer, mediumKey, "image/webp", bucket);
        mediumUrl = buildS3ImageUrl(mediumKey, bucket);
    } catch (err) {
        console.warn("[uploads/finalize] draft medium failed", err);
    }

    // Append to the draft's photo_urls so the existing publish-from-draft flow
    // (createListing → keptDraftPhotoUrls handling) picks the image up
    // unchanged.
    const existing = Array.isArray(draft.photo_urls) ? draft.photo_urls : [];
    if (!existing.includes(imageUrl)) {
        await prisma.draft.update({
            where: { id: draftId },
            data: {
                photo_urls: { set: [...existing, imageUrl] },
                updated_at: new Date(),
            },
        });
    }

    return NextResponse.json({ imageUrl, thumbUrl, mediumUrl });
}
