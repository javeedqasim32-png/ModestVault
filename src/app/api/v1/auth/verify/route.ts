import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { signAccessToken } from "@/lib/api/jwt";
import { issueRefreshToken } from "@/lib/api/refresh-token";

export const dynamic = "force-dynamic";

const VerifyBody = z.object({
    email: z.string().trim().email("Enter a valid email address."),
    code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
    deviceId: z.string().max(128).optional(),
});

/**
 * POST /api/v1/auth/verify
 *
 * Step 2 of the mobile signup: validates the 6-digit code against the
 * PendingUser row, promotes the pending row to a real User in one transaction,
 * and — unlike the web path which redirects to /login — issues an access +
 * refresh token pair so the app can auto-log the user in without a second
 * round-trip. Cookie-boundary concerns that force web to relogin don't apply
 * here because the mobile client owns its own token storage.
 *
 * Response mirrors POST /api/v1/auth/login exactly so AuthController.signIn
 * and this endpoint's success path are interchangeable at the storage layer.
 */
export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, VerifyBody);
    if (parsed instanceof NextResponse) return parsed;

    const email = parsed.email.toLowerCase();

    const pending = await prisma.pendingUser.findUnique({ where: { email } });
    if (!pending) {
        return apiError("NOT_FOUND", "Signup session not found or expired.");
    }
    if (pending.attempt_count >= 5) {
        return apiError(
            "RATE_LIMITED",
            "Too many failed attempts. Please request a new code.",
        );
    }
    if (new Date() > pending.code_expiry) {
        return apiError(
            "INVALID_INPUT",
            "Verification code has expired. Please request a new one.",
        );
    }

    const ok = await bcrypt.compare(parsed.code, pending.verification_code_hash);
    if (!ok) {
        await prisma.pendingUser.update({
            where: { email },
            data: { attempt_count: pending.attempt_count + 1 },
        });
        return apiError("INVALID_INPUT", "Invalid verification code.");
    }

    const createdUser = await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) throw new Error("USER_EXISTS");

        const user = await tx.user.create({
            data: {
                first_name: pending.first_name,
                last_name: pending.last_name,
                email: pending.email,
                password_hash: pending.password_hash,
                phone: pending.phone,
                street1: pending.street1,
                street2: pending.street2,
                city: pending.city,
                state: pending.state,
                zip: pending.zip,
                country: pending.country,
                sms_opt_in: pending.sms_opt_in,
                marketing_email_opt_in: pending.marketing_email_opt_in,
                email_verified: true,
            },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                is_admin: true,
                seller_enabled: true,
                profile_image: true,
            },
        });

        await tx.pendingUser.delete({ where: { email } });
        return user;
    }).catch((err) => {
        if (err instanceof Error && err.message === "USER_EXISTS") {
            return "USER_EXISTS" as const;
        }
        throw err;
    });

    if (createdUser === "USER_EXISTS") {
        return apiError("CONFLICT", "An account with this email already exists.");
    }

    // Auto-login: issue the same access/refresh pair /auth/login would.
    const accessToken = await signAccessToken({
        sub: createdUser.id,
        isAdmin: createdUser.is_admin,
        sellerEnabled: createdUser.seller_enabled,
    });
    const refresh = await issueRefreshToken(createdUser.id, parsed.deviceId ?? null);

    return NextResponse.json({
        accessToken,
        refreshToken: refresh.token,
        refreshExpiresAt: refresh.expiresAt.toISOString(),
        user: {
            id: createdUser.id,
            email: createdUser.email,
            firstName: createdUser.first_name,
            lastName: createdUser.last_name,
            isAdmin: createdUser.is_admin,
            sellerEnabled: createdUser.seller_enabled,
            profileImage: createdUser.profile_image,
        },
    });
}
