import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { parseJsonBody } from "@/lib/api/validate";
import { normalizeUsPhoneInput, hasCarrierPhoneLength } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/account/profile
 *
 * Returns the authenticated user's editable profile fields. Used by
 * the mobile Settings screen to prefill the form. Address fields are
 * the same ones used by Shippo as the seller "from" address.
 */
export async function GET(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const user = await prisma.user.findUnique({
        where: { id: principal.id },
        select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
            street1: true,
            street2: true,
            city: true,
            state: true,
            zip: true,
            country: true,
            profile_image: true,
            created_at: true,
        },
    });
    if (!user) return apiError("NOT_FOUND", "Profile not found.");

    return NextResponse.json({
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone ?? "",
        street1: user.street1 ?? "",
        street2: user.street2 ?? "",
        city: user.city ?? "",
        state: user.state ?? "",
        zip: user.zip ?? "",
        country: user.country ?? "US",
        profileImage: user.profile_image,
        memberSinceLabel: `Member since ${user.created_at.toLocaleDateString(
            "en-US",
            { month: "long", year: "numeric" },
        )}`,
    });
}

const updateSchema = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(1).max(40),
    street1: z.string().trim().min(1).max(200),
    street2: z.string().trim().max(200).optional().nullable(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(60),
    zip: z.string().trim().min(1).max(20),
    country: z.string().trim().min(2).max(60),
});

/**
 * PUT /api/v1/account/profile
 *
 * Mirrors updateUserProfile in src/app/actions/auth.ts. Phone is
 * normalized to digits-only and length-validated so Shippo accepts
 * it on the next label purchase.
 */
export async function PUT(req: NextRequest) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in required.");

    const parsed = await parseJsonBody(req, updateSchema);
    if (parsed instanceof NextResponse) return parsed;
    const data = parsed;

    const normalizedPhone = normalizeUsPhoneInput(data.phone);
    if (!hasCarrierPhoneLength(normalizedPhone)) {
        return apiError(
            "INVALID_INPUT",
            "Phone number must contain between 8 and 15 digits.",
            { phone: "Invalid length." },
        );
    }

    await prisma.user.update({
        where: { id: principal.id },
        data: {
            first_name: data.firstName,
            last_name: data.lastName,
            phone: normalizedPhone,
            street1: data.street1,
            street2: data.street2 ?? null,
            city: data.city,
            state: data.state,
            zip: data.zip,
            country: data.country,
        },
    });

    return NextResponse.json({ success: true });
}
