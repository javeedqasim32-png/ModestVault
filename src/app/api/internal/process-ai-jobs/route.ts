import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processAICoverJob } from "@/lib/ai-cover-worker";
import { createNotification } from "@/app/actions/notifications";

export const dynamic = "force-dynamic";

/**
 * Cron sweeper for AI cover jobs. Two passes:
 *
 *   1. Rescue stuck QUEUED:  jobs that have been QUEUED >90s never got their
 *      in-process worker fire (process crash between INSERT and the
 *      fire-and-forget call, or the call threw synchronously). Re-launch
 *      processAICoverJob — it's idempotent on the QUEUED status check.
 *
 *   2. Timeout PROCESSING:   jobs PROCESSING >5min are stuck (worker crashed
 *      mid-OpenAI call, network hang, etc.). Mark FAILED with a timeout
 *      message so the seller gets notified and can retry instead of polling
 *      forever.
 *
 * Auth: x-cron-secret header against INTERNAL_CRON_SECRET — same pattern as
 * /api/internal/release-seller-transfers.
 *
 * Recommended schedule: every 2 minutes via EC2 crontab.
 *   `* /2 * * * * curl -X POST https://shopmodaire.com/api/internal/process-ai-jobs -H "x-cron-secret: $SECRET"`
 */
function isAuthorized(request: Request) {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    const provided = request.headers.get("x-cron-secret");
    return provided === expected;
}

const QUEUED_RESCUE_THRESHOLD_MS = 90 * 1000;          // 90 seconds
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;           // 5 minutes
const MAX_RESCUES_PER_RUN = 10;                        // cap per cron tick

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ai = (prisma as any).aICoverJob;
    if (!ai) {
        return NextResponse.json({ error: "AI jobs not available." }, { status: 500 });
    }

    const now = new Date();
    const queuedCutoff = new Date(now.getTime() - QUEUED_RESCUE_THRESHOLD_MS);
    const processingCutoff = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);

    // ── Pass 1: rescue stuck QUEUED ────────────────────────────────────
    const stuckQueued = await ai.findMany({
        where: { status: "QUEUED", created_at: { lte: queuedCutoff } },
        orderBy: { created_at: "asc" },
        take: MAX_RESCUES_PER_RUN,
        select: { id: true },
    });
    for (const row of stuckQueued) {
        // Fire-and-forget so one slow OpenAI call doesn't block the rest of
        // the sweep. The worker is idempotent on its own QUEUED check.
        processAICoverJob(row.id).catch((err) =>
            console.error("[cron:ai-jobs] rescue worker crashed", { jobId: row.id, err }),
        );
    }

    // ── Pass 2: timeout stuck PROCESSING ───────────────────────────────
    const stuckProcessing = await ai.findMany({
        where: { status: "PROCESSING", started_at: { lte: processingCutoff } },
        orderBy: { started_at: "asc" },
        take: MAX_RESCUES_PER_RUN,
        select: { id: true, user_id: true, title: true },
    });
    let timedOut = 0;
    for (const row of stuckProcessing) {
        // updateMany with the same status filter so a worker that completes
        // RIGHT as the sweep runs doesn't get clobbered.
        const result = await ai.updateMany({
            where: { id: row.id, status: "PROCESSING" },
            data: {
                status: "FAILED",
                error_message: "Timed out — please try again.",
                completed_at: new Date(),
            },
        });
        if (result.count > 0) {
            timedOut += 1;
            try {
                await createNotification({
                    userId: row.user_id,
                    type: "AI_COVER_FAILED",
                    title: `Couldn't generate "${truncate(row.title, 40)}"`,
                    body: "Your AI cover preview timed out. Open the sell page to try again.",
                    linkUrl: "/sell",
                });
            } catch (notifyErr) {
                console.warn("[cron:ai-jobs] notification write failed", notifyErr);
            }
        }
    }

    return NextResponse.json({
        success: true,
        summary: {
            rescuedQueued: stuckQueued.length,
            timedOutProcessing: timedOut,
        },
    });
}

function truncate(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
