import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

const Body = z.object({
    type: z.string().min(1).max(80).optional(),
    id: z.string().uuid().optional(),
});

/**
 * POST /api/v1/notifications/mark-read
 *
 * Bulk-marks notifications as read for the calling user. Modes:
 *   - `{id: "..."}`   only that single notification (used by the
 *                     Notifications screen on row tap)
 *   - `{type: "..."}` every unread of that type (used by the Sell
 *                     screen's Sold/Pending tab tap)
 *   - `{}`            every unread notification (used by Mark all read)
 *
 * Mirrors the web's `markNotificationRead`, `markNotificationsTypeRead`,
 * and `markAllNotificationsRead` server actions.
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    await prisma.notification.updateMany({
        where: {
            user_id: principal.id,
            read_at: null,
            ...(parsed.id ? { id: parsed.id } : {}),
            ...(parsed.type ? { type: parsed.type } : {}),
        },
        data: { read_at: new Date() },
    });

    return NextResponse.json({ ok: true });
}
