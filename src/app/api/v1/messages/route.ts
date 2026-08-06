import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/messages
 *
 * Returns the buyer/seller-side inbox for the calling user. Mirrors
 * src/app/messages/page.tsx: one row per "other user" the user has
 * exchanged messages with, ordered by most-recent activity, with the
 * latest message preview + unread count attached.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const rows = await prisma.conversation.findMany({
        where: {
            messages: { some: {} },
            OR: [{ buyer_id: principal.id }, { seller_id: principal.id }],
        },
        orderBy: { updated_at: "desc" },
        include: {
            buyer: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    is_admin: true,
                    profile_image: true,
                },
            },
            seller: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    is_admin: true,
                    profile_image: true,
                },
            },
            listing: { select: { id: true, title: true } },
            messages: {
                orderBy: { created_at: "desc" },
                take: 1,
                select: { body: true, image_url: true, created_at: true },
            },
        },
    });

    // Per-conversation unread count for the calling user (messages
    // they didn't send + read_at is null).
    const unreadCounts = await prisma.conversationMessage.groupBy({
        by: ["conversation_id"],
        where: {
            conversation_id: { in: rows.map((r) => r.id) },
            sender_id: { not: principal.id },
            read_at: null,
        },
        _count: { _all: true },
    });
    const unreadByConv = new Map(
        unreadCounts.map((u) => [u.conversation_id, u._count._all]),
    );

    // De-dupe by "other user" to match the website's inbox shape.
    const seen = new Set<string>();
    const inbox: Array<Record<string, unknown>> = [];
    for (const c of rows) {
        const otherUserId =
            c.buyer_id === principal.id ? c.seller_id : c.buyer_id;
        if (seen.has(otherUserId)) continue;
        seen.add(otherUserId);
        const otherUser = c.buyer_id === principal.id ? c.seller : c.buyer;
        const latest = c.messages[0];
        const isSupport =
            Boolean(otherUser.is_admin) && c.listing_id == null;
        inbox.push({
            id: c.id,
            otherUser: {
                id: otherUser.id,
                firstName: otherUser.first_name,
                lastName: otherUser.last_name,
                profileImage: otherUser.profile_image,
                isAdmin: otherUser.is_admin,
            },
            listing: c.listing
                ? { id: c.listing.id, title: c.listing.title }
                : null,
            latestBody: latest?.body ?? null,
            latestHasImage: Boolean(latest?.image_url),
            latestAt: (latest?.created_at ?? c.updated_at).toISOString(),
            unreadCount: unreadByConv.get(c.id) ?? 0,
            isSupport,
        });
    }

    return NextResponse.json({ conversations: inbox });
}

const StartBody = z.object({
    sellerId: z.string().uuid(),
    listingId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/v1/messages
 *
 * Idempotent "start or open" — finds the existing buyer↔seller
 * conversation (composite unique) or creates a new one. Returns the
 * conversation id so the client can navigate straight into the thread.
 *
 * Refuses if you target yourself (no self-conversations).
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, StartBody);
    if (parsed instanceof NextResponse) return parsed;
    if (parsed.sellerId === principal.id) {
        return apiError(
            "INVALID_INPUT",
            "You can't start a conversation with yourself.",
        );
    }
    const seller = await prisma.user.findUnique({
        where: { id: parsed.sellerId },
        select: { id: true },
    });
    if (!seller) return apiError("NOT_FOUND", "Seller not found.");

    const conversation = await prisma.conversation.upsert({
        where: {
            buyer_id_seller_id: {
                buyer_id: principal.id,
                seller_id: parsed.sellerId,
            },
        },
        update: parsed.listingId !== undefined
            ? { listing_id: parsed.listingId }
            : {},
        create: {
            buyer_id: principal.id,
            seller_id: parsed.sellerId,
            listing_id: parsed.listingId ?? null,
        },
    });
    return NextResponse.json({ conversationId: conversation.id });
}
