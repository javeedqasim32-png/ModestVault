import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

const SendBody = z.object({
    body: z.string().trim().min(1).max(4000).optional(),
    imageUrl: z.string().url().max(2048).optional(),
}).refine((v) => Boolean(v.body) || Boolean(v.imageUrl), {
    message: "Either body or imageUrl is required.",
});

/**
 * GET /api/v1/messages/[id]
 *
 * Full conversation with messages in chronological order. Caller must
 * be a participant; otherwise 404 (don't leak existence).
 *
 * The fetch implicitly bumps `read_at` on incoming unread messages —
 * matches the website's behavior where opening the thread page
 * marks-read via the server action.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const conv = await prisma.conversation.findUnique({
        where: { id },
        include: {
            buyer: {
                select: {
                    id: true, first_name: true, last_name: true,
                    profile_image: true, is_admin: true,
                },
            },
            seller: {
                select: {
                    id: true, first_name: true, last_name: true,
                    profile_image: true, is_admin: true,
                },
            },
            listing: { select: { id: true, title: true } },
            messages: {
                orderBy: { created_at: "asc" },
                select: {
                    id: true,
                    body: true,
                    image_url: true,
                    created_at: true,
                    read_at: true,
                    sender_id: true,
                },
            },
        },
    });
    if (!conv) return apiError("NOT_FOUND", "Conversation not found.");
    if (conv.buyer_id !== principal.id && conv.seller_id !== principal.id) {
        return apiError("NOT_FOUND", "Conversation not found.");
    }

    // Mark incoming-side messages read. Fire-and-forget after we have
    // the snapshot for the response so the caller still sees the prior
    // unread state if they need it (the inbox count refresh handles UI).
    prisma.conversationMessage
        .updateMany({
            where: {
                conversation_id: id,
                sender_id: { not: principal.id },
                read_at: null,
            },
            data: { read_at: new Date() },
        })
        .catch(() => {});

    const other = conv.buyer_id === principal.id ? conv.seller : conv.buyer;
    return NextResponse.json({
        id: conv.id,
        otherUser: {
            id: other.id,
            firstName: other.first_name,
            lastName: other.last_name,
            profileImage: other.profile_image,
            isAdmin: other.is_admin,
        },
        listing: conv.listing
            ? { id: conv.listing.id, title: conv.listing.title }
            : null,
        messages: conv.messages.map((m) => ({
            id: m.id,
            body: m.body,
            imageUrl: m.image_url,
            createdAt: m.created_at.toISOString(),
            readAt: m.read_at?.toISOString() ?? null,
            mine: m.sender_id === principal.id,
        })),
    });
}

/**
 * POST /api/v1/messages/[id]
 *
 * Sends a new message into the conversation. Body and/or imageUrl —
 * at least one required. Bumps the conversation's `updated_at` so the
 * inbox re-orders correctly.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const { id } = await params;
    const conv = await prisma.conversation.findUnique({
        where: { id },
        select: { buyer_id: true, seller_id: true },
    });
    if (!conv) return apiError("NOT_FOUND", "Conversation not found.");
    if (conv.buyer_id !== principal.id && conv.seller_id !== principal.id) {
        return apiError("NOT_FOUND", "Conversation not found.");
    }

    const parsed = await parseJsonBody(req, SendBody);
    if (parsed instanceof NextResponse) return parsed;

    const created = await prisma.$transaction(async (tx) => {
        const message = await tx.conversationMessage.create({
            data: {
                conversation_id: id,
                sender_id: principal.id,
                body: parsed.body ?? "",
                image_url: parsed.imageUrl ?? null,
            },
        });
        await tx.conversation.update({
            where: { id },
            data: { updated_at: new Date() },
        });
        return message;
    });

    return NextResponse.json({
        message: {
            id: created.id,
            body: created.body,
            imageUrl: created.image_url,
            createdAt: created.created_at.toISOString(),
            readAt: null,
            mine: true,
        },
    });
}
