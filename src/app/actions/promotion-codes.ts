"use server";

// Server actions for the buyer-facing PromotionCode system. Two audiences:
//   - Admin (createPromotionCode / deactivatePromotionCode / listPromotionCodes)
//     — gated by requireAdmin.
//   - Buyer (validatePromoCodeForCheckout) — auth'd user only, uses their
//     session buyer id (never trusted from the client).

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
    normalizeCode,
    validatePromotionCode,
    type ValidCodeResult,
    type InvalidCodeResult,
} from "@/lib/promotion-codes";

async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Authentication required.");
    }
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, is_admin: true },
    });
    if (!user?.is_admin) {
        throw new Error("Admin access required.");
    }
    return user;
}

export type CreatePromotionCodeInput = {
    code: string;
    discountPercent: number;
    absorber?: "MODAIRE" | "SELLER";
    appliesToListingId?: string | null;
    appliesToBuyerId?: string | null;
    maxRedemptions?: number | null;
    expiresAt?: Date | null;
    notes?: string | null;
};

export async function createPromotionCode(
    input: CreatePromotionCodeInput,
): Promise<{ success: true; id: string } | { error: string }> {
    let admin;
    try {
        admin = await requireAdmin();
    } catch (err) {
        return { error: err instanceof Error ? err.message : "Authentication error." };
    }

    const normalized = normalizeCode(input.code);
    if (normalized.length === 0) {
        return { error: "Code is required." };
    }
    if (normalized.length > 64) {
        return { error: "Code must be 64 characters or fewer." };
    }
    if (
        !Number.isInteger(input.discountPercent) ||
        input.discountPercent < 1 ||
        input.discountPercent > 100
    ) {
        return { error: "Discount percent must be an integer between 1 and 100." };
    }
    // For MVP, only MODAIRE is exercised. Reject SELLER so no code path is
    // built on an untested branch.
    const absorber = input.absorber === "SELLER" ? "SELLER" : "MODAIRE";
    if (absorber === "SELLER") {
        return { error: "SELLER-absorbed codes aren't supported yet — use a seller PromotionCampaign instead." };
    }
    if (
        input.maxRedemptions !== undefined &&
        input.maxRedemptions !== null &&
        (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1)
    ) {
        return { error: "Max redemptions must be a positive integer or empty." };
    }

    try {
        const row = await (prisma as any).promotionCode.create({
            data: {
                code: normalized,
                discount_percent: input.discountPercent,
                absorber,
                applies_to_listing_id: input.appliesToListingId?.trim() || null,
                applies_to_buyer_id: input.appliesToBuyerId?.trim() || null,
                max_redemptions:
                    input.maxRedemptions === null || input.maxRedemptions === undefined
                        ? null
                        : input.maxRedemptions,
                expires_at: input.expiresAt ?? null,
                notes: input.notes?.trim() || null,
                created_by_id: admin.id,
            },
            select: { id: true },
        });
        revalidatePath("/admin/promo-codes");
        return { success: true, id: row.id };
    } catch (err: any) {
        if (err?.code === "P2002") {
            return { error: `A code named "${normalized}" already exists.` };
        }
        console.error("createPromotionCode failed:", err);
        return { error: "Failed to create promo code." };
    }
}

export async function deactivatePromotionCode(
    id: string,
): Promise<{ success: true } | { error: string }> {
    try {
        await requireAdmin();
    } catch (err) {
        return { error: err instanceof Error ? err.message : "Authentication error." };
    }
    try {
        await (prisma as any).promotionCode.update({
            where: { id },
            data: { active: false },
        });
        revalidatePath("/admin/promo-codes");
        return { success: true };
    } catch (err) {
        console.error("deactivatePromotionCode failed:", err);
        return { error: "Failed to deactivate code." };
    }
}

/**
 * Buyer-facing preview call from the checkout page. Returns the discount
 * amount so the client can show the updated total BEFORE the buyer commits
 * to checkout. Server also re-validates at payment-intent creation — the
 * client value is never trusted at money time.
 */
export async function validatePromoCodeForCheckout(input: {
    code: string;
    listingId: string;
}): Promise<
    | { valid: true; code: string; discountPercent: number }
    | { valid: false; error: string }
> {
    const session = await auth();
    if (!session?.user?.id) {
        return { valid: false, error: "Sign in to apply a promo code." };
    }
    const buyerId = session.user.id;

    const result: ValidCodeResult | InvalidCodeResult = await validatePromotionCode({
        code: input.code,
        listingId: input.listingId,
        buyerId,
    });
    if (!result.valid) {
        return { valid: false, error: result.error };
    }
    return { valid: true, code: result.code, discountPercent: result.discountPercent };
}
