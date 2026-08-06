import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

const Body = z.object({
    imageUrl: z.string().min(1).max(2048),
});

/**
 * POST /api/v1/seller/drafts/[id]/attach-ai-cover
 *
 * Appends an AI-generated cover URL to draft.generated_image_urls. The
 * AI worker writes the result_image_url onto the AICoverJob row; the
 * mobile client polls for completion and calls this to "claim" the
 * cover into its draft.
 *
 * No-op if the URL is already attached (idempotent).
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    const draft = await (prisma as any).draft.findUnique({ where: { id } });
    if (!draft || draft.user_id !== principal.id) {
        return apiError("NOT_FOUND", "Draft not found.");
    }

    const existing: string[] = draft.generated_image_urls ?? [];
    if (existing.includes(parsed.imageUrl)) {
        return NextResponse.json({ ok: true, alreadyAttached: true });
    }

    await (prisma as any).draft.update({
        where: { id },
        data: {
            generated_image_urls: [...existing, parsed.imageUrl],
        },
    });
    return NextResponse.json({ ok: true });
}
