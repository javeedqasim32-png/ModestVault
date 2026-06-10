import { randomUUID } from "crypto";
import sharp from "sharp";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { buildS3ImageUrl, downloadFile, getS3BucketName, s3, uploadFile } from "@/lib/s3";
import { getSkinToneTemplateUrl } from "@/lib/ai-cover-options";
import { buildAICoverPrompt, describeSlot, type SlotRole } from "@/lib/ai-cover-prompt";
import { createNotification } from "@/app/actions/notifications";

/**
 * Worker that processes a single AICoverJob row. Called in two places:
 *
 *   1. Fire-and-forget from POST /api/ai/jobs after the row is INSERTed,
 *      so the seller gets back a job id in ~50ms and the generation runs
 *      out-of-band.
 *   2. From the cron sweeper at POST /api/internal/process-ai-jobs to
 *      rescue any QUEUED rows whose fire-and-forget never fired (process
 *      crashed between INSERT and the worker call).
 *
 * Idempotent on the QUEUED check: if the row's status is anything other
 * than QUEUED when we load it, we bail without doing work — prevents
 * double-processing if both the in-process call AND the cron sweeper
 * race for the same id.
 */
export async function processAICoverJob(jobId: string): Promise<void> {
    const ai = (prisma as any).aICoverJob;
    if (!ai) {
        console.error("[ai-worker] prisma.aICoverJob is undefined — stale client");
        return;
    }

    // 1. Load + atomically claim by flipping QUEUED → PROCESSING. Using
    // updateMany so the where clause runs as one SQL statement (no read-then-
    // write race). If 0 rows updated, someone else already claimed it.
    const job = await ai.findUnique({ where: { id: jobId } });
    if (!job) {
        console.warn("[ai-worker] job not found", { jobId });
        return;
    }
    if (job.status !== "QUEUED") {
        // Already being processed by another caller (race between
        // fire-and-forget and the cron sweeper) — nothing to do.
        console.log("[ai-worker] job not QUEUED, skipping", { jobId, status: job.status });
        return;
    }

    const claim = await ai.updateMany({
        where: { id: jobId, status: "QUEUED" },
        data: { status: "PROCESSING", started_at: new Date(), attempts: { increment: 1 } },
    });
    if (claim.count === 0) {
        console.log("[ai-worker] lost claim race for job", { jobId });
        return;
    }

    try {
        await runGenerationAndStore(job);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown generation error";
        console.error("[ai-worker] job failed", { jobId, error: message });
        await ai.update({
            where: { id: jobId },
            data: { status: "FAILED", error_message: message, completed_at: new Date() },
        });
        // Best-effort notification. Don't let a failed notification mask the
        // real error.
        try {
            await createNotification({
                userId: job.user_id,
                type: "AI_COVER_FAILED",
                title: `Couldn't generate "${truncate(job.title, 40)}"`,
                body: "Your AI cover preview didn't generate this time. Open the sell page to try again.",
                linkUrl: "/sell",
            });
        } catch (notifyErr) {
            console.warn("[ai-worker] failed-notification write failed", notifyErr);
        }
    }
}

async function runGenerationAndStore(job: any): Promise<void> {
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) throw new Error("OPENAI_API_KEY is not configured");
    const bucket = getS3BucketName();
    if (!bucket) throw new Error("S3 bucket is not configured");

    const userId: string = job.user_id;
    const refKeys: string[] = job.reference_image_keys || [];
    if (refKeys.length === 0) throw new Error("Job has no reference images");

    // 1. Resolve studio template URL for the chosen skin tone
    const staticRefUrl = getSkinToneTemplateUrl(job.model_skin_tone) ?? process.env.AI_STATIC_REFERENCE_URL ?? null;
    if (!staticRefUrl) throw new Error(`No studio template available for tone "${job.model_skin_tone}"`);

    // 2. Download template
    const templateBuffer = await downloadFromUrlOrS3(staticRefUrl, bucket);
    if (!templateBuffer) throw new Error("Failed to load the studio template image");

    // 3. Download each reference image from S3 (uploaded by the submit endpoint)
    const refBuffers: Buffer[] = [];
    for (const key of refKeys) {
        const buf = await downloadFromS3Key(key, bucket);
        if (!buf) throw new Error(`Reference image missing in S3: ${key}`);
        refBuffers.push(buf);
    }

    // 4. Sharp-preprocess everything to 1024x1536 PNG
    const formData = new FormData();
    const processedTemplate = await prepareImageForOpenAI(templateBuffer);
    formData.append("image[]", new Blob([new Uint8Array(processedTemplate)], { type: "image/png" }), "template.png");
    for (let i = 0; i < refBuffers.length; i++) {
        const processed = await prepareImageForOpenAI(refBuffers[i]);
        // Slot label is implicit in position — the prompt's image-role lines reference Image N+1.
        formData.append("image[]", new Blob([new Uint8Array(processed)], { type: "image/png" }), `ref${i + 1}.png`);
    }

    // 5. Build prompt via the shared helper so the sync route and the async
    //    worker stay in sync. Slot identity is parsed from the S3 key the
    //    submit endpoint wrote (`ai-refs/{userId}/{jobId}-{slot}.png`).
    const referenceRoles = refKeys.map((key) => {
        const match = /-(fullOutfit|top|bottom|dupatta|closeup)\.png$/.exec(key);
        const slot = (match?.[1] ?? "") as SlotRole | "";
        return slot ? describeSlot(slot) : "reference photo of the garment";
    });
    const promptText = buildAICoverPrompt({
        title: job.title,
        category: job.category,
        subcategory: job.subcategory,
        style: job.style,
        size: job.size,
        description: job.description,
        hijabRequired: !!job.hijab_required,
        referenceRoles,
    });
    formData.append("model", "gpt-image-2-2026-04-21");
    formData.append("prompt", promptText);
    formData.append("n", "1");
    formData.append("size", "1024x1536");
    formData.append("quality", "high");

    // 6. Call OpenAI
    const openAiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: formData,
    });

    if (!openAiRes.ok) {
        const errBody = await openAiRes.text();
        throw new Error(`OpenAI ${openAiRes.status}: ${errBody.slice(0, 300)}`);
    }

    // 7. Pull image bytes out of the response (base64 or hosted URL)
    const json = await openAiRes.json();
    const b64: string | undefined = json?.data?.[0]?.b64_json;
    const hostedUrl: string | undefined = json?.data?.[0]?.url;
    let imageBuffer: Buffer | null = null;
    if (b64) {
        imageBuffer = Buffer.from(b64, "base64");
    } else if (hostedUrl) {
        const remote = await fetch(hostedUrl);
        if (!remote.ok) throw new Error(`Failed to download hosted result: ${remote.status}`);
        imageBuffer = Buffer.from(await remote.arrayBuffer());
    } else {
        throw new Error("OpenAI returned no image data");
    }

    // 8. Upload to S3 + write the COMPLETED row
    const imageId = randomUUID();
    const outKey = `listings/ai-generated/${userId}/${imageId}.png`;
    await uploadFile(imageBuffer, outKey, "image/png", bucket);
    const finalImageUrl = buildS3ImageUrl(outKey, bucket);

    await (prisma as any).aICoverJob.update({
        where: { id: job.id },
        data: {
            status: "COMPLETED",
            result_image_url: finalImageUrl,
            completed_at: new Date(),
            error_message: null,
        },
    });

    // 9. Notify the seller. The link puts them back on /sell with the job id as
    // a hint; the sell page server fetch will pick up the result regardless.
    try {
        await createNotification({
            userId,
            type: "AI_COVER_READY",
            title: `Your AI preview is ready`,
            body: `"${truncate(job.title, 60)}" is generated. Tap to add it to your listing.`,
            linkUrl: `/sell?aiJobId=${job.id}&create=1#preview-photos-anchor`,
        });
    } catch (notifyErr) {
        console.warn("[ai-worker] ready-notification write failed (non-fatal)", notifyErr);
    }
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

async function prepareImageForOpenAI(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
        .resize(1024, 1536, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();
}

/** Try S3 SDK first, fall back to HTTP fetch for URLs not in our bucket. */
async function downloadFromUrlOrS3(refUrl: string, bucket: string): Promise<Buffer | null> {
    let key = "";
    try {
        key = new URL(refUrl).pathname.replace(/^\//, "");
    } catch {
        key = "";
    }
    if (key) {
        try {
            const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            if (res.Body) {
                const bytes = await res.Body.transformToByteArray();
                return Buffer.from(bytes);
            }
        } catch {
            // fall through to HTTP fallback
        }
    }
    try {
        const res = await fetch(refUrl);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
    } catch {
        return null;
    }
}

async function downloadFromS3Key(key: string, bucket: string): Promise<Buffer | null> {
    // Use the shared downloadFile helper so dev-mode (which writes to
    // public/<key> via uploadFile) reads from the same place. Direct S3
    // calls bypass the dev-mode local-filesystem branch and 404 in dev.
    const buf = await downloadFile(key, bucket);
    if (!buf) {
        console.warn(`[ai-worker] download failed for key ${key}`);
    }
    return buf;
}

function truncate(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
