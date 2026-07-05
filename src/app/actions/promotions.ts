"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashInvitationToken } from "@/lib/promotions/invitation-token";

/**
 * Seller-facing action bound to the /promotions/approve/[token] page. Given
 * the plaintext token from the URL, the seller submits which listings they
 * want to opt into the promotion. The action:
 *
 *   1. Re-verifies the token (hash → PromotionInvitation.token_hash lookup)
 *      and its expiry. Never trusts a stale server-rendered snapshot.
 *   2. Fetches the campaign to check its status is still valid.
 *   3. Owner-scopes every write to invitation.seller_id — a seller who
 *      crafts a POST containing another seller's listing id gets that id
 *      silently ignored (0 rows matched, no error surfaced).
 *   4. Flips selected listings' ListingPromotion.status to ACCEPTED; flips
 *      previously-ACCEPTED but now-unselected ones to DECLINED.
 *
 * Idempotent: submitting the same list twice produces the same DB state.
 */
export async function submitPromotionApproval(input: {
    token: string;
    listingIds: string[];
}): Promise<{ success: true; acceptedCount: number; declinedCount: number } | { error: string }> {
    const token = (input.token || "").trim();
    if (!token) return { error: "Missing invitation token." };

    const tokenHash = hashInvitationToken(token);
    const now = new Date();

    const invitation = await (prisma as any).promotionInvitation.findUnique({
        where: { token_hash: tokenHash },
        select: {
            id: true,
            promotion_campaign_id: true,
            seller_id: true,
            expires_at: true,
        },
    });
    if (!invitation) return { error: "This invitation link is invalid or has been withdrawn." };
    if (invitation.expires_at <= now) return { error: "This invitation link has expired." };

    const campaign = await (prisma as any).promotionCampaign.findUnique({
        where: { id: invitation.promotion_campaign_id },
        select: { id: true, status: true, discount_percent: true },
    });
    if (!campaign || campaign.status === "CANCELLED" || campaign.status === "ENDED") {
        return { error: "This campaign is no longer accepting opt-ins." };
    }

    // Everything below is scoped to invitation.seller_id — foreign listing
    // ids sent from the browser will match zero rows and silently no-op.
    const requestedIds = Array.from(new Set(input.listingIds ?? [])).filter(
        (id): id is string => typeof id === "string" && id.length > 0,
    );

    // Existing ListingPromotion rows for this campaign + this seller. We
    // never fabricate new rows here; the campaign-generator script pre-seeds
    // them at INVITED. That means: if the seller sends a listing id that
    // isn't already in the invitation set, it's ignored (defense in depth).
    const currentRows = await (prisma as any).listingPromotion.findMany({
        where: {
            promotion_campaign_id: invitation.promotion_campaign_id,
            seller_id: invitation.seller_id,
        },
        select: { id: true, listing_id: true, status: true },
    });

    const requestedSet = new Set(requestedIds);
    const toAccept: string[] = [];
    const toDecline: string[] = [];
    for (const row of currentRows) {
        if (requestedSet.has(row.listing_id)) {
            // Selected: idempotent — only touch if not already ACCEPTED.
            if (row.status !== "ACCEPTED") toAccept.push(row.id);
        } else {
            // Unselected: only convert previously-ACCEPTED rows to DECLINED.
            // Leaving INVITED as INVITED lets a seller open the page later
            // and change their mind without a "you declined this" state.
            if (row.status === "ACCEPTED") toDecline.push(row.id);
        }
    }

    await prisma.$transaction(async (tx) => {
        if (toAccept.length > 0) {
            await (tx as any).listingPromotion.updateMany({
                where: { id: { in: toAccept } },
                data: { status: "ACCEPTED", accepted_at: now },
            });
        }
        if (toDecline.length > 0) {
            await (tx as any).listingPromotion.updateMany({
                where: { id: { in: toDecline } },
                data: { status: "DECLINED", declined_at: now },
            });
        }
    });

    // The public listing pages and card grids read fresh — revalidate to
    // drop any cached snapshots that pre-date this opt-in.
    revalidatePath("/");
    revalidatePath("/browse");
    revalidatePath(`/promotions/approve/${token}`);

    return {
        success: true as const,
        acceptedCount: toAccept.length,
        declinedCount: toDecline.length,
    };
}
