import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getS3BucketName, uploadFile } from "@/lib/s3";
import {
    DEFAULT_SKIN_TONE,
    isValidSkinTone,
    type SkinTone,
} from "@/lib/ai-cover-options";
import { processAICoverJob } from "@/lib/ai-cover-worker";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Same slot order the seller's drag-to-reorder UI implies — first uploaded
// file is treated as "full outfit", subsequent ones as additional angles.
// We persist them in this order so the prompt can reference Image N+1.
type SlotRole = "fullOutfit" | "top" | "bottom" | "dupatta" | "closeup";
const SLOT_ORDER: ReadonlyArray<SlotRole> = ["fullOutfit", "top", "bottom", "dupatta", "closeup"];

/**
 * POST /api/ai/jobs
 *
 * Submit a new AI cover generation job. Returns immediately with a job id
 * the client can poll. The actual OpenAI call runs in the background via
 * `processAICoverJob` (fire-and-forget) and falls back to the cron sweeper
 * at /api/internal/process-ai-jobs if the in-process worker doesn't fire.
 *
 * Concurrency: one job in-flight per seller. A second submit while one is
 * QUEUED/PROCESSING returns 409 with the existing job id so the client can
 * resume polling on the same job.
 */
export async function POST(req: NextRequest) {
    try {
        // 1. Auth
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        // 2. Config sanity
        const openAiKey = process.env.OPENAI_API_KEY;
        if (!openAiKey) {
            return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
        }
        const bucket = getS3BucketName();
        if (!bucket) {
            return NextResponse.json({ error: "S3 bucket is not configured" }, { status: 500 });
        }

        // 3. Concurrency check: one in-flight per seller. This is a count-then-
        //    insert with a small race window — acceptable for v1 (the worst case
        //    is one extra duplicate generation, bounded by OpenAI's per-request
        //    rate limit). Tighten later with a partial-unique index if needed.
        const ai = (prisma as any).aICoverJob;
        if (!ai) {
            console.error("[ai-jobs] prisma.aICoverJob is undefined — stale client");
            return NextResponse.json({ error: "AI jobs not available in this environment." }, { status: 500 });
        }
        const existing = await ai.findFirst({
            where: { user_id: userId, status: { in: ["QUEUED", "PROCESSING"] } },
            orderBy: { created_at: "desc" },
            select: { id: true, status: true },
        });
        if (existing) {
            return NextResponse.json({
                error: "You already have a generation in progress — we'll notify you when it's ready.",
                jobId: existing.id,
                status: existing.status,
            }, { status: 409 });
        }

        // 4. Parse multipart form
        const contentType = req.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
            return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
        }

        let form: FormData;
        try {
            form = await req.formData();
        } catch {
            return NextResponse.json({ error: "Invalid form data payload." }, { status: 400 });
        }

        // Reference files in slot order. Each slot can be either a fresh
        // upload (`reference_<slot>` File field) OR a reused reference from a
        // previous job (`restoredReference_<slot>` URL field). The reused
        // path lets the seller regenerate from photos they already uploaded
        // without re-uploading from the device.
        const slotFiles = new Map<SlotRole, File>();
        const slotRestoredKeys = new Map<SlotRole, string>();
        for (const slot of SLOT_ORDER) {
            const file = form.get(`reference_${slot}`);
            if (file && typeof (file as File).arrayBuffer === "function") {
                slotFiles.set(slot, file as File);
                continue;
            }
            const restoredUrl = form.get(`restoredReference_${slot}`)?.toString().trim();
            if (restoredUrl) {
                // Extract the S3 key and verify it belongs to this seller's
                // ai-refs/ namespace. Prevents a malicious client from passing
                // a URL pointing at someone else's images. Accept both
                // absolute URLs (prod: https://bucket.s3.../ai-refs/...) and
                // relative paths (dev: /ai-refs/...) since buildS3ImageUrl
                // returns different shapes depending on environment.
                let key = "";
                if (restoredUrl.startsWith("/")) {
                    key = restoredUrl.replace(/^\/+/, "");
                } else {
                    try {
                        key = new URL(restoredUrl).pathname.replace(/^\/+/, "");
                    } catch {
                        key = "";
                    }
                }
                const expectedPrefix = `ai-refs/${userId}/`;
                if (key.startsWith(expectedPrefix) && key.endsWith(".png")) {
                    slotRestoredKeys.set(slot, key);
                }
            }
        }
        if (slotFiles.size === 0 && slotRestoredKeys.size === 0) {
            return NextResponse.json({ error: "At least one garment photo is required." }, { status: 400 });
        }

        // Validate every fresh file (restored keys are trusted since they were
        // already validated when first uploaded).
        for (const [slot, file] of slotFiles) {
            if (file.size > MAX_FILE_SIZE_BYTES) {
                return NextResponse.json({ error: `${slot} image exceeds 10MB.` }, { status: 400 });
            }
            const mt = file.type || "image/png";
            if (!ALLOWED_MIME_TYPES.includes(mt)) {
                return NextResponse.json({ error: `${slot} image has an invalid file type.` }, { status: 400 });
            }
        }

        // Other fields
        const rawTone = form.get("modelSkinTone")?.toString() ?? "";
        const modelSkinTone: SkinTone = isValidSkinTone(rawTone) ? rawTone : DEFAULT_SKIN_TONE;

        const rawHijab = form.get("hijabRequired")?.toString() ?? "";
        if (rawHijab !== "true" && rawHijab !== "false") {
            return NextResponse.json({ error: "Please choose whether the model wears a hijab." }, { status: 400 });
        }
        const hijabRequired = rawHijab === "true";

        const sanitizeShort = (raw: string) =>
            raw.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
        const sanitizeLong = (raw: string) =>
            raw.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 700);

        const garmentTitle = sanitizeShort(form.get("garmentTitle")?.toString() ?? "").slice(0, 120);
        const garmentCategory = sanitizeShort(form.get("garmentCategory")?.toString() ?? "");
        const garmentSubcategory = sanitizeShort(form.get("garmentSubcategory")?.toString() ?? "");
        const garmentStyle = sanitizeShort(form.get("garmentStyle")?.toString() ?? "");
        const garmentSize = sanitizeShort(form.get("garmentSize")?.toString() ?? "");
        const garmentDescription = sanitizeLong(form.get("garmentDescription")?.toString() ?? "");
        const draftId = form.get("draftId")?.toString().trim() || null;

        // 5. Validation — title is required, the rest are optional. When
        //    category / style / description ARE provided they're passed to the
        //    AI prompt (via TYPE LOCK + DESCRIPTION HINT blocks) for sharper
        //    results, but missing values fall back to the original photos-only
        //    interpretation. Required-on-publish validation still happens at
        //    submit-listing time.
        if (!garmentTitle || garmentTitle.length < 4) {
            return NextResponse.json({ error: "Please add a title before generating a preview." }, { status: 400 });
        }

        // 6. Pre-allocate a job id so we can use it in the S3 keys of the
        //    reference uploads (avoids a second DB write later to fix keys).
        const jobId = randomUUID();

        // 7. Build the reference list in slot order.
        //    Fresh uploads → sharp-normalize then upload under the new jobId.
        //    Restored URLs → reuse the existing S3 object directly (no copy
        //    or re-upload — the bytes already live in our bucket).
        const referenceImageKeys: string[] = [];
        for (const slot of SLOT_ORDER) {
            const file = slotFiles.get(slot);
            if (file) {
                const buf = Buffer.from(await file.arrayBuffer());
                const normalized = await sharp(buf)
                    .resize(1024, 1536, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
                    .png()
                    .toBuffer();
                const key = `ai-refs/${userId}/${jobId}-${slot}.png`;
                await uploadFile(normalized, key, "image/png", bucket);
                referenceImageKeys.push(key);
                continue;
            }
            const restored = slotRestoredKeys.get(slot);
            if (restored) {
                referenceImageKeys.push(restored);
            }
        }

        if (referenceImageKeys.length === 0) {
            return NextResponse.json({ error: "Failed to store reference images." }, { status: 500 });
        }

        // 8. INSERT the AICoverJob row.
        const job = await ai.create({
            data: {
                id: jobId,
                user_id: userId,
                draft_id: draftId,
                status: "QUEUED",
                title: garmentTitle,
                category: garmentCategory,
                subcategory: garmentSubcategory || null,
                style: garmentStyle,
                size: garmentSize || null,
                description: garmentDescription,
                hijab_required: hijabRequired,
                model_skin_tone: modelSkinTone,
                reference_image_keys: referenceImageKeys,
            },
            select: { id: true, status: true },
        });

        // 9. Fire-and-forget the worker. No await — the caller gets back in
        //    ~50ms while OpenAI churns in the background. The cron sweeper at
        //    /api/internal/process-ai-jobs catches any QUEUED row whose
        //    in-process worker never fired (e.g., process crash).
        processAICoverJob(job.id).catch((err) => {
            console.error("[ai-jobs] background worker crashed", { jobId: job.id, err });
        });

        return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
    } catch (err) {
        console.error("[ai-jobs] unexpected error", err);
        return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
    }
}
