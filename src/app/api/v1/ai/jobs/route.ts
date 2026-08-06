import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { processAICoverJob } from "@/lib/ai-cover-worker";
import { getS3BucketName } from "@/lib/s3";

export const dynamic = "force-dynamic";

const Body = z.object({
    draftId: z.string().uuid(),
    modelSkinTone: z
        .enum(["light", "medium-light", "medium", "medium-dark", "dark"])
        .optional()
        .default("medium"),
    hijabRequired: z.boolean().optional().default(false),
});

/**
 * POST /api/v1/ai/jobs
 *
 * Mobile-side parallel of /api/ai/jobs. Instead of uploading reference
 * photos in this request, we reuse the photos already attached to the
 * draft (via the uploads/finalize endpoint). The draft must have all
 * required taxonomy fields populated; otherwise we'd be guessing at
 * the prompt content.
 *
 * Concurrency: same one-in-flight-per-user rule as the web flow — a
 * second submit while a job is QUEUED/PROCESSING returns 409 with the
 * existing job id so the client can resume polling.
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    if (!process.env.OPENAI_API_KEY) {
        return apiError(
            "UNAVAILABLE",
            "AI cover generation is not configured on this server.",
        );
    }
    const bucket = getS3BucketName();
    if (!bucket) {
        return apiError("UNAVAILABLE", "S3 bucket not configured.");
    }

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const draft = await (prisma as any).draft.findUnique({
        where: { id: parsed.draftId },
    });
    if (!draft || draft.user_id !== principal.id) {
        return apiError("NOT_FOUND", "Draft not found.");
    }

    const missing: string[] = [];
    if (!draft.title?.trim()) missing.push("title");
    if (!draft.category?.trim()) missing.push("category");
    if (!draft.style?.trim()) missing.push("style");
    if (!draft.description?.trim()) missing.push("description");
    if (missing.length > 0) {
        return apiError(
            "INVALID_INPUT",
            `Add ${missing.join(", ")} before generating a cover.`,
        );
    }
    const referencePhotoUrls: string[] = draft.photo_urls ?? [];
    if (referencePhotoUrls.length === 0) {
        return apiError(
            "INVALID_INPUT",
            "Upload at least one photo before generating a cover.",
        );
    }

    // Convert public URLs back to S3 keys. The AI worker downloads by
    // key (dev mode reads from public/<key>; prod reads from S3) so we
    // peel the prefix off whichever form we got.
    const referenceKeys = referencePhotoUrls.map(toS3Key);

    // One-in-flight gate. Skip CLAIMED-but-stuck rows older than 1h.
    const aiDelegate = (prisma as any).aICoverJob;
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const existing = await aiDelegate.findFirst({
        where: {
            user_id: principal.id,
            status: { in: ["QUEUED", "PROCESSING"] },
            created_at: { gt: cutoff },
        },
        orderBy: { created_at: "desc" },
    });
    if (existing) {
        return NextResponse.json(
            { jobId: existing.id, status: existing.status, resumed: true },
            { status: 409 },
        );
    }

    const job = await aiDelegate.create({
        data: {
            user_id: principal.id,
            draft_id: parsed.draftId,
            status: "QUEUED",
            title: draft.title!,
            category: draft.category!,
            subcategory: draft.subcategory ?? null,
            style: draft.style!,
            size: draft.size ?? null,
            description: draft.description!,
            hijab_required: parsed.hijabRequired,
            model_skin_tone: parsed.modelSkinTone,
            reference_image_keys: referenceKeys,
        },
    });

    // Fire-and-forget. If the in-process worker doesn't fire (cold start,
    // function recycle), the cron sweeper at /api/internal/process-ai-jobs
    // picks it up on the next minute.
    processAICoverJob(job.id).catch((err) =>
        console.error("[ai-jobs:v1] inline trigger failed", err),
    );

    return NextResponse.json({ jobId: job.id, status: job.status });
}

function toS3Key(urlOrKey: string): string {
    // Dev mode emits relative paths like "/drafts/<userId>/<draftId>/<file>".
    if (urlOrKey.startsWith("/")) return urlOrKey.slice(1);
    try {
        const u = new URL(urlOrKey);
        return u.pathname.replace(/^\/+/, "");
    } catch {
        // Already a bare key.
        return urlOrKey.replace(/^\/+/, "");
    }
}
