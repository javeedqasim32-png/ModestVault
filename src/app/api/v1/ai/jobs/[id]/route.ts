import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ai/jobs/[id]
 *
 * Polled by the mobile wizard while it waits for OpenAI. Owner-only;
 * not-yours → 404.
 *
 * On COMPLETED the client appends `resultImageUrl` to the draft's
 * generated_image_urls and reloads.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const job = await (prisma as any).aICoverJob.findUnique({
        where: { id },
        select: {
            id: true,
            user_id: true,
            status: true,
            result_image_url: true,
            error_message: true,
            attempts: true,
            created_at: true,
            updated_at: true,
        },
    });
    if (!job || job.user_id !== principal.id) {
        return apiError("NOT_FOUND", "Job not found.");
    }

    return NextResponse.json({
        id: job.id,
        status: job.status,
        resultImageUrl: job.result_image_url ?? null,
        errorMessage: job.error_message ?? null,
        attempts: job.attempts,
        createdAt: job.created_at.toISOString(),
        updatedAt: job.updated_at.toISOString(),
    });
}
