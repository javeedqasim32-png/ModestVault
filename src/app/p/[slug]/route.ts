import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Short-URL redirect for SMS promotion invitations. The 160-char SMS
 * segment budget makes the long-token approval URL impractical, so SMS
 * carries a 10-char plaintext slug instead:
 *
 *   Email link:  /promotions/approve/{64-char-hex-token}
 *   SMS link:    /p/{10-char-base62-slug}   →  302 redirect here
 *
 * The approval page/action accept either the long token OR the short
 * slug for lookup, so downstream behavior is identical.
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug || slug.length > 32) {
        return new NextResponse("Not found", { status: 404 });
    }

    const invitation = await (prisma as any).promotionInvitation.findUnique({
        where: { short_slug: slug },
        select: { id: true, expires_at: true },
    });
    if (!invitation) return new NextResponse("Not found", { status: 404 });
    if (invitation.expires_at <= new Date()) {
        // Same friendly copy the approval page renders for expired links —
        // let that page handle the UI so we have one source of truth.
        return NextResponse.redirect(
            new URL(`/promotions/approve/${slug}`, _req.url),
            302,
        );
    }
    return NextResponse.redirect(
        new URL(`/promotions/approve/${slug}`, _req.url),
        302,
    );
}
