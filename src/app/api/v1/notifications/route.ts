import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/v1/notifications?limit=50
 *
 * Returns the calling user's notification feed, newest first. Mirrors
 * `listMyNotifications` server action. The mobile Notifications screen
 * lists these; tapping a row marks-read (single id) and deep-links via
 * `linkUrl` if present.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = QuerySchema.safeParse(
        Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) {
        return apiError("INVALID_INPUT", "Invalid query parameters.");
    }

    const rows = await prisma.notification.findMany({
        where: { user_id: principal.id },
        orderBy: { created_at: "desc" },
        take: parsed.data.limit,
    });

    return NextResponse.json({
        notifications: rows.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            linkUrl: n.link_url,
            readAt: n.read_at?.toISOString() ?? null,
            createdAt: n.created_at.toISOString(),
        })),
    });
}
