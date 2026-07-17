"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Admin-only actions for the marketing queue.
 *
 * The AI Marketing Team is generate-only: agents produce copy + image,
 * the admin approves, then MANUALLY posts to FB / IG / TikTok. These
 * actions record the workflow steps — nothing auto-publishes.
 *
 * Status flow: PENDING → APPROVED → POSTED   (happy path)
 *                     → REJECTED             (dropped)
 */
async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Not signed in");
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { is_admin: true },
    });
    if (!user?.is_admin) throw new Error("Not authorized");
    return session.user.id;
}

/**
 * Approve a PENDING draft — signals to the admin "this is ready to
 * post." Also lets the admin edit copy in-place before approving.
 */
export async function approveDraft(input: {
    id: string;
    caption?: string;
    hashtags?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAdmin();
    try {
        const existing = await prisma.marketingDraft.findUnique({
            where: { id: input.id },
            select: { status: true },
        });
        if (!existing) return { ok: false, error: "Draft not found" };
        if (existing.status !== "PENDING") {
            return { ok: false, error: `Cannot approve draft in status ${existing.status}` };
        }
        await prisma.marketingDraft.update({
            where: { id: input.id },
            data: {
                caption: input.caption ?? undefined,
                hashtags: input.hashtags ?? undefined,
                status: "APPROVED",
                reject_reason: null,
            },
        });
        revalidatePath("/admin/marketing/queue");
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Reject a draft — either from PENDING (not good enough to post) or
 * from APPROVED (changed your mind after approving). Rejected rows
 * stay in the DB for audit but disappear from the active queue.
 */
export async function rejectDraft(input: {
    id: string;
    reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAdmin();
    try {
        const existing = await prisma.marketingDraft.findUnique({
            where: { id: input.id },
            select: { status: true },
        });
        if (!existing) return { ok: false, error: "Draft not found" };
        if (existing.status === "POSTED" || existing.status === "REJECTED") {
            return { ok: false, error: `Cannot reject draft in status ${existing.status}` };
        }
        await prisma.marketingDraft.update({
            where: { id: input.id },
            data: {
                status: "REJECTED",
                reject_reason: input.reason.slice(0, 500),
            },
        });
        revalidatePath("/admin/marketing/queue");
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Mark an APPROVED draft as posted — the admin has manually uploaded
 * to the platform. Optional postedUrl lets the admin log the live
 * post URL for later audit / metric tracking.
 */
export async function markAsPosted(input: {
    id: string;
    postedUrl?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    await requireAdmin();
    try {
        const existing = await prisma.marketingDraft.findUnique({
            where: { id: input.id },
            select: { status: true },
        });
        if (!existing) return { ok: false, error: "Draft not found" };
        if (existing.status !== "APPROVED") {
            return { ok: false, error: `Only APPROVED drafts can be marked posted (current: ${existing.status})` };
        }
        const url = (input.postedUrl || "").trim();
        await prisma.marketingDraft.update({
            where: { id: input.id },
            data: {
                status: "POSTED",
                posted_at: new Date(),
                posted_url: url || null,
            },
        });
        revalidatePath("/admin/marketing/queue");
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
