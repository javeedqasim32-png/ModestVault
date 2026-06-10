import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/jobs/[id]
 *
 * Polled by the sell-page client every few seconds while a job is in flight.
 * Returns 404 (not 403) when the caller doesn't own the row, so we don't leak
 * the existence of other sellers' jobs.
 */
export async function GET(
    _req: Request,
    context: { params: Promise<{ id: string }> },
) {
    const { id } = await context.params;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const ai = (prisma as any).aICoverJob;
    if (!ai) {
        return NextResponse.json({ error: "AI jobs not available." }, { status: 500 });
    }

    const job = await ai.findUnique({
        where: { id },
        select: {
            id: true,
            user_id: true,
            status: true,
            result_image_url: true,
            error_message: true,
            created_at: true,
            completed_at: true,
        },
    });

    // Treat "not yours" the same as "not found" — don't leak existence to
    // other sellers.
    if (!job || job.user_id !== userId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
        id: job.id,
        status: job.status,
        resultImageUrl: job.result_image_url,
        errorMessage: job.error_message,
        createdAt: job.created_at,
        completedAt: job.completed_at,
    });
}
