import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

const TypesParam = z
    .string()
    .min(1)
    .max(200)
    .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean));

/**
 * GET /api/v1/notifications/unread-counts?types=ITEM_SOLD,LISTING_REJECTED
 *
 * Drives the Sell tab red-dot badges. Returns a per-type count of
 * unread notifications for the calling user. Types not in the response
 * default to 0 on the client so callers never have to deal with missing
 * keys.
 *
 * Mirrors the server action `getUnreadNotificationCountsByType` in
 * src/app/actions/notifications.ts so mobile + web stay in lockstep.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const raw = req.nextUrl.searchParams.get("types");
    if (!raw) {
        return NextResponse.json({ counts: {} });
    }
    const parsed = TypesParam.safeParse(raw);
    if (!parsed.success || parsed.data.length === 0) {
        return apiError("INVALID_INPUT", "Invalid `types` parameter.");
    }
    const types = parsed.data;

    // n parallel COUNTs against the existing (user_id, read_at) index —
    // for the 2-3 types we care about this is sub-millisecond.
    const counts = await Promise.all(
        types.map((type) =>
            prisma.notification.count({
                where: { user_id: principal.id, type, read_at: null },
            }),
        ),
    );
    const result: Record<string, number> = {};
    types.forEach((t, i) => {
        result[t] = counts[i];
    });
    return NextResponse.json({ counts: result });
}
