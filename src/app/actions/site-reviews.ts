"use server";

// Server actions for the site-review system. Two audiences:
//   - Any signed-in user: submitSiteReview + deleteMySiteReview
//   - Admin only: hideSiteReview + unhideSiteReview
//
// Reads (aggregate, list, own) live in src/lib/site-reviews.ts —
// pulled directly by server components without going through actions.

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const MAX_BODY_LENGTH = 500;

async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Authentication required.");
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, is_admin: true },
    });
    if (!user?.is_admin) throw new Error("Admin access required.");
    return user;
}

export type SubmitSiteReviewInput = {
    rating: number;   // 1-5
    body?: string | null;
};

/**
 * Insert or update the current user's site review. One review per
 * user (unique index on user_id), so the same user calling this
 * multiple times updates in place — no dedupe drift.
 */
export async function submitSiteReview(
    input: SubmitSiteReviewInput,
): Promise<{ success: true } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Sign in to leave a review." };
    }
    const userId = session.user.id;

    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
        return { error: "Rating must be a whole number between 1 and 5." };
    }
    const body = (input.body ?? "").trim();
    if (body.length > MAX_BODY_LENGTH) {
        return { error: `Review text is too long (max ${MAX_BODY_LENGTH} characters).` };
    }

    try {
        await (prisma as any).siteReview.upsert({
            where: { user_id: userId },
            create: {
                user_id: userId,
                rating: input.rating,
                body: body.length > 0 ? body : null,
                // Status defaults to PUBLISHED; if the user was previously
                // hidden by admin, upsert-create won't run — upsert-update
                // below intentionally leaves `status` alone so admin
                // decisions stick across user edits.
            },
            update: {
                rating: input.rating,
                body: body.length > 0 ? body : null,
            },
        });
        revalidatePath("/reviews");
        revalidatePath("/");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (err) {
        console.error("submitSiteReview failed:", err);
        return { error: "Failed to save review. Please try again." };
    }
}

export async function deleteMySiteReview(): Promise<{ success: true } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) return { error: "Sign in to manage your review." };
    try {
        await (prisma as any).siteReview.deleteMany({
            where: { user_id: session.user.id },
        });
        revalidatePath("/reviews");
        revalidatePath("/");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (err) {
        console.error("deleteMySiteReview failed:", err);
        return { error: "Failed to delete review." };
    }
}

export async function hideSiteReview(
    id: string,
    reason?: string,
): Promise<{ success: true } | { error: string }> {
    let admin;
    try {
        admin = await requireAdmin();
    } catch (err) {
        return { error: err instanceof Error ? err.message : "Authentication error." };
    }
    try {
        await (prisma as any).siteReview.update({
            where: { id },
            data: {
                status: "HIDDEN",
                hidden_at: new Date(),
                hidden_by_id: admin.id,
                hidden_reason: (reason ?? "").trim() || null,
            },
        });
        revalidatePath("/reviews");
        revalidatePath("/");
        revalidatePath("/admin/reviews");
        return { success: true };
    } catch (err) {
        console.error("hideSiteReview failed:", err);
        return { error: "Failed to hide review." };
    }
}

export async function unhideSiteReview(
    id: string,
): Promise<{ success: true } | { error: string }> {
    try {
        await requireAdmin();
    } catch (err) {
        return { error: err instanceof Error ? err.message : "Authentication error." };
    }
    try {
        await (prisma as any).siteReview.update({
            where: { id },
            data: {
                status: "PUBLISHED",
                hidden_at: null,
                hidden_by_id: null,
                hidden_reason: null,
            },
        });
        revalidatePath("/reviews");
        revalidatePath("/");
        revalidatePath("/admin/reviews");
        return { success: true };
    } catch (err) {
        console.error("unhideSiteReview failed:", err);
        return { error: "Failed to unhide review." };
    }
}
