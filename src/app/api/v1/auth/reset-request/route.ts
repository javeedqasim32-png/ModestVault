import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/api/validate";
import { sendPasswordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const ResetRequestBody = z.object({
    email: z.string().trim().email("Enter a valid email address."),
});

/**
 * POST /api/v1/auth/reset-request
 *
 * Kicks off the forgot-password flow: generates a 32-byte hex token, stores
 * it on the User row with a 1-hour expiry, and emails a link that points at
 * the existing web reset page (`/reset-password?token=...`). The app deep
 * link handoff is deferred — until Associated Domains / assetlinks.json are
 * wired, the email link opens in mobile browser and the user completes the
 * reset on web.
 *
 * Always returns 200 even when the email is unknown so an attacker can't
 * enumerate registered addresses by observing 200 vs 404.
 */
export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, ResetRequestBody);
    if (parsed instanceof NextResponse) return parsed;

    const email = parsed.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        const expiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await prisma.user.update({
            where: { email },
            data: { reset_token: token, reset_token_expiry: expiry },
        });
        await sendPasswordResetEmail(email, token);
    }

    return NextResponse.json({ ok: true });
}
