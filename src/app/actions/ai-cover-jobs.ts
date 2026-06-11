"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Clear the seller's recently-completed AI cover jobs so the next time they
 * open /sell they get a fresh form, not the photos / fields from the listing
 * they just published. Called from the publish-success path on the client.
 *
 * Scope:
 *  - Owner-only (auth check)
 *  - Only jobs from the last hour (matches the server-side hydration window
 *    in /sell/page.tsx — older rows are already invisible to the UI)
 *  - Deletes COMPLETED and FAILED rows. Leaves QUEUED / PROCESSING alone so
 *    we don't tear down a generation the seller may still want.
 *
 * The S3 reference images at ai-refs/{userId}/{jobId}-{slot}.png are left
 * behind — they're tiny and a separate cleanup concern.
 */
export async function clearRecentAICoverJobs(): Promise<{ deleted: number }> {
    const session = await auth();
    if (!session?.user?.id) return { deleted: 0 };

    const ai = (prisma as any).aICoverJob;
    if (!ai) return { deleted: 0 };

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await ai.deleteMany({
        where: {
            user_id: session.user.id,
            created_at: { gte: oneHourAgo },
            status: { in: ["COMPLETED", "FAILED", "TIMEOUT"] },
        },
    });
    return { deleted: result.count ?? 0 };
}
