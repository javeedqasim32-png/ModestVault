import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/messages/support
 *
 * Opens (or returns) the conversation between the calling user and the
 * founding admin acting as Modaire Support. Mirrors
 * startConversationWithSupport in src/app/actions/messages.ts so the
 * mobile Account "Live Chat" tile and the website's Live Chat button
 * land on the same conversation row.
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    if (principal.isAdmin) {
        return apiError(
            "INVALID_INPUT",
            "Admins handle support — you can't message yourself.",
        );
    }

    const supportAdmin = await prisma.user.findFirst({
        where: { is_admin: true },
        orderBy: { created_at: "asc" },
        select: { id: true },
    });
    if (!supportAdmin) {
        return apiError(
            "UNAVAILABLE",
            "Support is currently unavailable. Please try again later.",
        );
    }

    let conversation = await prisma.conversation.findFirst({
        where: {
            OR: [
                { buyer_id: principal.id, seller_id: supportAdmin.id },
                { buyer_id: supportAdmin.id, seller_id: principal.id },
            ],
        },
        select: { id: true },
    });
    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                buyer_id: principal.id,
                seller_id: supportAdmin.id,
            },
            select: { id: true },
        });
    }

    return NextResponse.json({ conversationId: conversation.id });
}
