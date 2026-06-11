import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { signAccessToken } from "@/lib/api/jwt";
import { issueRefreshToken } from "@/lib/api/refresh-token";

export const dynamic = "force-dynamic";

const LoginBody = z.object({
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(1, "Password is required."),
    deviceId: z.string().max(128).optional(),
});

/**
 * POST /api/v1/auth/login
 *
 * Issues an access JWT (15m) + opaque refresh token (30d) for the mobile
 * client. Mirrors the bcrypt + soft-disable checks the NextAuth Credentials
 * provider already uses (src/auth.ts) so web and mobile honor the same auth
 * decisions.
 *
 * Response shape:
 *   200 { accessToken, refreshToken, refreshExpiresAt, user: { id, email, firstName, lastName, isAdmin, sellerEnabled, profileImage } }
 *   401 INVALID_INPUT/UNAUTHORIZED on bad credentials or disabled account.
 */
export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, LoginBody);
    if (parsed instanceof NextResponse) return parsed;

    const email = parsed.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            password_hash: true,
            is_admin: true,
            seller_enabled: true,
            is_disabled: true,
            profile_image: true,
            deleted_at: true,
        },
    });

    // Same generic 401 for both "no such user" and "wrong password" so we
    // don't leak which emails are registered.
    if (!user || user.is_disabled || user.deleted_at) {
        return apiError("UNAUTHORIZED", "Email or password is incorrect.");
    }

    const ok = await bcrypt.compare(parsed.password, user.password_hash);
    if (!ok) {
        return apiError("UNAUTHORIZED", "Email or password is incorrect.");
    }

    const accessToken = await signAccessToken({
        sub: user.id,
        isAdmin: user.is_admin,
        sellerEnabled: user.seller_enabled,
    });
    const refresh = await issueRefreshToken(user.id, parsed.deviceId ?? null);

    return NextResponse.json({
        accessToken,
        refreshToken: refresh.token,
        refreshExpiresAt: refresh.expiresAt.toISOString(),
        user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            isAdmin: user.is_admin,
            sellerEnabled: user.seller_enabled,
            profileImage: user.profile_image,
        },
    });
}
