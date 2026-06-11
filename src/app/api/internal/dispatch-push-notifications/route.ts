import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendFcmMessages, isFcmEnabled, type FcmMessage } from "@/lib/fcm";

export const dynamic = "force-dynamic";

/**
 * Cron-driven dispatcher for the NotificationOutbox queue.
 *
 *   1. Pulls up to MAX_PER_RUN outbox rows where sent_at IS NULL and
 *      next_attempt_at <= now().
 *   2. For each row, fans out across the user's active DeviceToken rows
 *      (one push per device).
 *   3. Marks sent_at on success.
 *   4. On failure, increments attempts and schedules next_attempt_at with
 *      exponential backoff (60s × 2^attempts, capped at 1h).
 *   5. Revokes any DeviceToken Firebase reports as invalid.
 *
 * Auth: `x-cron-secret` header against INTERNAL_CRON_SECRET. Same pattern as
 * the existing AI-jobs sweeper at /api/internal/process-ai-jobs.
 *
 * Recommended schedule: every 1 minute (`* /1 * * * *` in EC2 crontab).
 *
 * Safe to run when FCM_ENABLED=false — the outbox rows just keep accumulating
 * with sent_at=null. They drain automatically once Firebase is configured and
 * the flag flips on; nothing is lost.
 */
function isAuthorized(request: Request) {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    const provided = request.headers.get("x-cron-secret");
    return provided === expected;
}

const MAX_PER_RUN = 100;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 60 * 1000;       // 1 minute
const MAX_BACKOFF_MS = 60 * 60 * 1000;   // 1 hour

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fast no-op when FCM is disabled — keeps the cron cheap and lets the
    // outbox accumulate safely until Firebase is wired up.
    if (!isFcmEnabled()) {
        return NextResponse.json({ skipped: "FCM_DISABLED" });
    }

    const now = new Date();
    const pending = await (prisma as any).notificationOutbox.findMany({
        where: { sent_at: null, next_attempt_at: { lte: now } },
        orderBy: { created_at: "asc" },
        take: MAX_PER_RUN,
    });

    if (pending.length === 0) {
        return NextResponse.json({ sent: 0, failed: 0 });
    }

    // Resolve recipient device tokens in one query rather than N.
    const userIds = Array.from(new Set(pending.map((p: any) => p.user_id)));
    const devices = await (prisma as any).deviceToken.findMany({
        where: { user_id: { in: userIds }, revoked_at: null },
        select: { token: true, user_id: true },
    });
    const devicesByUser = new Map<string, string[]>();
    for (const d of devices) {
        const list = devicesByUser.get(d.user_id) ?? [];
        list.push(d.token);
        devicesByUser.set(d.user_id, list);
    }

    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];

    for (const row of pending) {
        const tokens = devicesByUser.get(row.user_id) ?? [];
        if (tokens.length === 0) {
            // No active devices — mark sent so we don't keep retrying for
            // a user who never installed the app. The in-app bell still
            // shows the notification.
            await (prisma as any).notificationOutbox.update({
                where: { id: row.id },
                data: { sent_at: new Date(), failed_reason: "NO_DEVICES" },
            });
            sent += 1;
            continue;
        }

        const messages: FcmMessage[] = tokens.map((token: string) => ({
            token,
            title: row.title,
            body: row.body,
            data: {
                notificationId: row.notification_id,
                type: row.type,
                ...(row.data && typeof row.data === "object" ? row.data : {}),
            },
        }));

        try {
            const results = await sendFcmMessages(messages);
            const anySuccess = results.some((r) => r.success);
            for (const r of results) {
                if (r.invalidToken) invalidTokens.push(r.token);
            }
            if (anySuccess) {
                await (prisma as any).notificationOutbox.update({
                    where: { id: row.id },
                    data: { sent_at: new Date(), attempts: { increment: 1 } },
                });
                sent += 1;
            } else {
                await scheduleRetry(row, "all device sends failed");
                failed += 1;
            }
        } catch (err) {
            await scheduleRetry(row, err instanceof Error ? err.message : "unknown");
            failed += 1;
        }
    }

    if (invalidTokens.length > 0) {
        await (prisma as any).deviceToken.updateMany({
            where: { token: { in: invalidTokens }, revoked_at: null },
            data: { revoked_at: new Date() },
        });
    }

    return NextResponse.json({
        sent,
        failed,
        revokedTokens: invalidTokens.length,
    });
}

async function scheduleRetry(row: { id: string; attempts: number }, reason: string) {
    const nextAttempts = row.attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
        await (prisma as any).notificationOutbox.update({
            where: { id: row.id },
            data: {
                sent_at: new Date(),
                attempts: nextAttempts,
                failed_reason: `Gave up after ${MAX_ATTEMPTS} attempts: ${reason}`,
            },
        });
        return;
    }
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, row.attempts));
    await (prisma as any).notificationOutbox.update({
        where: { id: row.id },
        data: {
            attempts: nextAttempts,
            next_attempt_at: new Date(Date.now() + backoff),
            failed_reason: reason,
        },
    });
}
