import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { sendVerificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const RESEND_COOLDOWN_MS = 30 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;

const ResendBody = z.object({
    email: z.string().trim().email("Enter a valid email address."),
});

/**
 * POST /api/v1/auth/resend
 *
 * Regenerates the 6-digit code for a pending signup and re-emails it. Enforces
 * a 30-second cooldown between sends so the endpoint can't be used to spam a
 * user's inbox. Also resets attempt_count so a user who's exhausted their 5
 * failed attempts can request a fresh code and try again.
 *
 * Response:
 *   200 { ok: true, cooldownSec }
 *   429 RATE_LIMITED if last send was under 30s ago.
 */
export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, ResendBody);
    if (parsed instanceof NextResponse) return parsed;

    const email = parsed.email.toLowerCase();
    const pending = await prisma.pendingUser.findUnique({ where: { email } });
    if (!pending) {
        return apiError("NOT_FOUND", "Signup session not found.");
    }

    if (pending.last_sent_at) {
        const elapsed = Date.now() - pending.last_sent_at.getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
            const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
            return apiError(
                "RATE_LIMITED",
                `Please wait ${waitSec}s before requesting a new code.`,
            );
        }
    }

    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(rawCode, 10);

    await prisma.pendingUser.update({
        where: { email },
        data: {
            verification_code_hash: codeHash,
            code_expiry: new Date(Date.now() + CODE_TTL_MS),
            attempt_count: 0,
            resend_count: pending.resend_count + 1,
            last_sent_at: new Date(),
        },
    });

    await sendVerificationEmail(email, rawCode);

    return NextResponse.json({
        ok: true,
        cooldownSec: RESEND_COOLDOWN_MS / 1000,
    });
}
