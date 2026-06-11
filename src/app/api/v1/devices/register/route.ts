import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

const Body = z.object({
    token: z.string().min(1).max(512),
    platform: z.enum(["ios", "android"]),
    appVersion: z.string().max(32).optional(),
});

/**
 * POST /api/v1/devices/register
 *
 * UPSERTs an FCM device token for the authenticated user. Called by the
 * Flutter app on login + whenever `onTokenRefresh` fires (Firebase rotates
 * tokens periodically). Idempotent on the token itself — re-registering the
 * same token bumps `last_seen_at` instead of creating a new row.
 *
 * If the token previously belonged to a different user (e.g., one phone with
 * two accounts), the row is reassigned to the current caller. The previous
 * owner's other devices still get push — only the shared token moves.
 *
 * Response: 204.
 */
export async function POST(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, Body);
    if (parsed instanceof NextResponse) return parsed;

    await (prisma as any).deviceToken.upsert({
        where: { token: parsed.token },
        update: {
            user_id: principal.id,
            platform: parsed.platform,
            app_version: parsed.appVersion ?? null,
            last_seen_at: new Date(),
            revoked_at: null,
        },
        create: {
            user_id: principal.id,
            token: parsed.token,
            platform: parsed.platform,
            app_version: parsed.appVersion ?? null,
        },
    });

    return new NextResponse(null, { status: 204 });
}
