import { NextResponse } from "next/server";
import { runDirector } from "@/lib/marketing/director";

export const dynamic = "force-dynamic";

/**
 * Marketing generate cron.
 *
 * Runs the Marketing Director → creates a MarketingBriefing +
 * PENDING MarketingDraft rows for admin approval at
 * /admin/marketing/queue. Nothing is auto-published.
 *
 * Recommended schedule: daily at 09:00 UTC.
 *
 * Query params:
 *   ?dry=1    — print intel + prompt inputs, skip LLM + DB writes
 *   ?max=6    — cap number of tasks the Director plans (default 6)
 *   ?force=1  — bypass "one briefing per day" idempotency
 *
 * Auth: x-cron-secret header against INTERNAL_CRON_SECRET.
 */
function isAuthorized(request: Request) {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    return request.headers.get("x-cron-secret") === expected;
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dry") === "1";
    const force = url.searchParams.get("force") === "1";
    const maxParam = url.searchParams.get("max");
    const maxTasks = maxParam ? Math.max(1, Math.min(12, Number(maxParam))) : 6;

    try {
        const summary = await runDirector({ dryRun, force, maxTasks });
        return NextResponse.json({ ok: true, dryRun, force, ...summary });
    } catch (err) {
        console.error("[marketing/generate] fatal:", err);
        return NextResponse.json(
            {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
        );
    }
}
