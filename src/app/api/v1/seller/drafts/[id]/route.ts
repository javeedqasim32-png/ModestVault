import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/seller/drafts/[id]
 *
 * Removes the draft row. We don't bother cleaning up the S3 photo
 * objects under drafts/<userId>/<draftId>/ here — those become
 * orphans that can be swept by a separate housekeeping job. Returning
 * 204 quickly matters more on a phone than fighting S3 latency on
 * the user's tap.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    await prisma.draft.deleteMany({
        where: { id, user_id: principal.id },
    });
    return new NextResponse(null, { status: 204 });
}
