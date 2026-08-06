import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { hasCarrierPhoneLength, normalizeUsPhoneInput } from "@/lib/phone";
import { sendVerificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const SignupBody = z.object({
    firstName: z.string().trim().min(1, "First name is required."),
    lastName: z.string().trim().min(1, "Last name is required."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    phone: z.string().trim().min(1, "Phone number is required."),
    street1: z.string().trim().min(1, "Street address is required."),
    street2: z.string().trim().optional().default(""),
    city: z.string().trim().min(1, "City is required."),
    state: z.string().trim().min(1, "State is required."),
    zip: z.string().trim().min(1, "Zip code is required."),
    country: z.string().trim().min(1, "Country is required."),
    smsOptIn: z.boolean().optional().default(false),
    marketingEmailOptIn: z.boolean().optional().default(false),
});

/**
 * POST /api/v1/auth/signup
 *
 * Step 1 of the mobile signup: validates the form, upserts a PendingUser row
 * with a bcrypt-hashed 6-digit code, and emails the code. Does NOT create the
 * final User yet — that happens in /api/v1/auth/verify after the user proves
 * they own the email address.
 *
 * Mirrors src/app/actions/auth.ts:startSignup() but reads a JSON body (mobile)
 * instead of FormData (web form-post) and returns the standard v1 error envelope.
 *
 * Response:
 *   200 { ok: true, email }
 *   409 CONFLICT if a full User row already exists for this email.
 */
export async function POST(req: NextRequest) {
    const parsed = await parseJsonBody(req, SignupBody);
    if (parsed instanceof NextResponse) return parsed;

    const email = parsed.email.toLowerCase();
    const phone = normalizeUsPhoneInput(parsed.phone);
    if (!hasCarrierPhoneLength(phone)) {
        return apiError(
            "INVALID_INPUT",
            "Phone number must contain between 8 and 15 digits.",
            { phone: "Between 8 and 15 digits." },
        );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        return apiError("CONFLICT", "An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(parsed.password, 10);
    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(rawCode, 10);
    const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const existingPending = await prisma.pendingUser.findUnique({ where: { email } });
    if (existingPending) {
        await prisma.pendingUser.update({
            where: { email },
            data: {
                first_name: parsed.firstName,
                last_name: parsed.lastName,
                password_hash: passwordHash,
                phone,
                street1: parsed.street1,
                street2: parsed.street2,
                city: parsed.city,
                state: parsed.state,
                zip: parsed.zip,
                country: parsed.country,
                sms_opt_in: parsed.smsOptIn,
                marketing_email_opt_in: parsed.marketingEmailOptIn,
                verification_code_hash: codeHash,
                code_expiry: codeExpiry,
                attempt_count: 0,
                resend_count: existingPending.resend_count + 1,
                last_sent_at: new Date(),
            },
        });
    } else {
        await prisma.pendingUser.create({
            data: {
                first_name: parsed.firstName,
                last_name: parsed.lastName,
                email,
                password_hash: passwordHash,
                phone,
                street1: parsed.street1,
                street2: parsed.street2,
                city: parsed.city,
                state: parsed.state,
                zip: parsed.zip,
                country: parsed.country,
                sms_opt_in: parsed.smsOptIn,
                marketing_email_opt_in: parsed.marketingEmailOptIn,
                verification_code_hash: codeHash,
                code_expiry: codeExpiry,
                last_sent_at: new Date(),
            },
        });
    }

    await sendVerificationEmail(email, rawCode);
    return NextResponse.json({ ok: true, email });
}
