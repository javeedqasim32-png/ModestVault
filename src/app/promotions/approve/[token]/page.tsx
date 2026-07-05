import { prisma } from "@/lib/prisma";
import { hashInvitationToken } from "@/lib/promotions/invitation-token";
import { getPrimaryListingImage } from "@/lib/listing-images";
import PromotionApprovalForm from "./PromotionApprovalForm";

export const dynamic = "force-dynamic";

/**
 * Seller-facing landing for a promotion invitation. URL carries only the
 * plaintext token — no seller id, no campaign id, no listing ids exposed.
 * Server hashes the token, looks up the invitation, verifies expiry, and
 * renders the seller's eligible listings for opt-in. On first successful
 * load we also stamp `first_opened_at` for basic analytics.
 *
 * All queries below are owner-scoped to invitation.seller_id — even if a
 * seller shares the link, whoever opens it can only ever see and toggle
 * that seller's listings.
 */
export default async function PromotionApprovalPage(
    { params }: { params: Promise<{ token: string }> },
) {
    const { token } = await params;
    const tokenHash = hashInvitationToken(token);
    const now = new Date();

    const invitation = await (prisma as any).promotionInvitation.findUnique({
        where: { token_hash: tokenHash },
        include: {
            promotion_campaign: true,
            seller: { select: { first_name: true, last_name: true } },
        },
    });

    if (!invitation) return <ExpiredOrInvalidState reason="invalid" />;
    if (invitation.expires_at <= now) return <ExpiredOrInvalidState reason="expired" />;

    const campaign = invitation.promotion_campaign;
    if (!campaign || campaign.status === "CANCELLED" || campaign.status === "ENDED") {
        return <ExpiredOrInvalidState reason="closed" />;
    }

    if (!invitation.first_opened_at) {
        // Fire-and-forget; a failed stamp never blocks the seller.
        await (prisma as any).promotionInvitation.update({
            where: { id: invitation.id },
            data: { first_opened_at: now },
        }).catch(() => {});
    }

    // Load every ListingPromotion row for this (campaign, seller) — the
    // generator script pre-seeds INVITED rows for eligible listings, so we
    // can enumerate them all here. Included: image + title + price for
    // rendering; the seller cannot see other sellers' rows because the
    // where clause pins seller_id.
    const rows = await (prisma as any).listingPromotion.findMany({
        where: {
            promotion_campaign_id: campaign.id,
            seller_id: invitation.seller_id,
        },
        include: {
            listing: {
                include: {
                    images: {
                        orderBy: { imageOrder: "asc" },
                        take: 1,
                    },
                },
            },
        },
        orderBy: { invited_at: "asc" },
    });

    const items = rows.map((row: any) => {
        const listing = row.listing;
        const originalCents = Math.round(Number(listing.price) * 100);
        const discountedCents = Math.round(
            (originalCents * (100 - campaign.discount_percent)) / 100,
        );
        return {
            listingPromotionId: row.id,
            listingId: listing.id,
            title: listing.title,
            image: getPrimaryListingImage(listing, "card"),
            originalPrice: originalCents / 100,
            discountedPrice: discountedCents / 100,
            initiallyAccepted: row.status === "ACCEPTED",
            currentStatus: row.status as string,
            available: listing.status === "AVAILABLE",
        };
    });

    const sellerName = `${invitation.seller.first_name} ${invitation.seller.last_name || ""}`.trim();
    const startsAt = new Date(campaign.starts_at);

    return (
        <div className="min-h-screen bg-[#f7f2ed] py-10">
            <div className="mx-auto w-full max-w-[720px] px-4">
                <div className="rounded-[16px] border border-[#e3d9d1] bg-white p-6 shadow-sm">
                    <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#8a7667]">
                        Modaire · {campaign.name}
                    </p>
                    <h1
                        className="mt-2 text-[26px] leading-[1.1] text-[#2f2925]"
                        style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}
                    >
                        Hi {invitation.seller.first_name || "there"} — pick your listings
                    </h1>
                    <p className="mt-2 text-[14px] leading-[1.55] text-[#6f6054]">
                        We're preparing a limited-time <strong>{campaign.discount_percent}% off</strong>{" "}
                        promotion starting{" "}
                        {startsAt.toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                        })}
                        . Choose which of your eligible listings you'd like to include —
                        selected items will show the discounted price on Modaire and
                        checkout will apply {campaign.discount_percent}% off automatically.
                        Prices return to normal when the campaign ends.
                    </p>
                    <div className="mt-3 rounded-[10px] bg-[#f9f4f1] px-4 py-3 text-[13px] text-[#4a3328]">
                        Your seller share stays at 85% of whatever the buyer pays, so on a
                        discounted item your payout is 85% of the discounted price.
                    </div>
                </div>

                <div className="mt-6">
                    {items.length === 0 ? (
                        <div className="rounded-[16px] border border-dashed border-[#d5c6b9] bg-white px-5 py-10 text-center text-[14px] text-[#8a7667]">
                            You don't have any eligible listings for this campaign at
                            the moment. Check back — new listings you add that match
                            the campaign target rules will show up here automatically.
                        </div>
                    ) : (
                        <PromotionApprovalForm
                            token={token}
                            campaignName={campaign.name}
                            discountPercent={campaign.discount_percent}
                            items={items}
                            sellerName={sellerName}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function ExpiredOrInvalidState({ reason }: { reason: "invalid" | "expired" | "closed" }) {
    const copy = reason === "invalid"
        ? {
              title: "Invitation link not recognized",
              body: "This link doesn't match any active invitation on Modaire. It may have been mistyped or already withdrawn.",
          }
        : reason === "expired"
        ? {
              title: "This invitation has expired",
              body: "Promotion opt-ins closed once the campaign began. If you'd still like to join a similar promotion in the future, keep an eye on your email — we run these regularly.",
          }
        : {
              title: "This campaign is no longer accepting opt-ins",
              body: "The campaign this link belongs to has ended or been cancelled. Any prices on your listings have returned to normal.",
          };
    return (
        <div className="min-h-screen bg-[#f7f2ed] py-16">
            <div className="mx-auto w-full max-w-[560px] px-6">
                <div className="rounded-[16px] border border-[#e3d9d1] bg-white p-8 text-center shadow-sm">
                    <h1
                        className="text-[24px] leading-[1.15] text-[#2f2925]"
                        style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}
                    >
                        {copy.title}
                    </h1>
                    <p className="mt-3 text-[14px] leading-[1.55] text-[#6f6054]">
                        {copy.body}
                    </p>
                </div>
            </div>
        </div>
    );
}
