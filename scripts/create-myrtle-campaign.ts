/**
 * Modaire — promotion campaign generator.
 *
 * Creates (or reuses) a PromotionCampaign, finds every seller with eligible
 * listings, and pre-seeds:
 *   - one PromotionInvitation per seller (unique on campaign+seller)
 *   - one ListingPromotion row per eligible listing (unique on
 *     campaign+listing) in status INVITED
 *
 * Every AVAILABLE + APPROVED listing is eligible by default (site-wide
 * campaign). Pass --keywords to restrict to a specific brand/name.
 * The discount only applies to listings each seller opts into on the
 * approval page — nothing gets discounted just by running this script.
 *
 * Fully idempotent: re-running never duplicates rows, never resends emails
 * (email_sent_at IS NULL guard), never overwrites ACCEPTED / DECLINED
 * ListingPromotion rows the seller has already touched.
 *
 * Usage (site-wide sale, most common):
 *   npx tsx scripts/create-myrtle-campaign.ts \
 *     --slug summer-sale-2026 \
 *     --name "Modaire Summer Sale" \
 *     --starts-at 2026-08-01T00:00:00-05:00 \
 *     --ends-at 2026-08-15T23:59:59-05:00 \
 *     --discount-percent 15
 *
 *   Optional flags:
 *     --dry-run          — roll everything back in a transaction; print
 *                          what would have happened.
 *     --send-emails      — fire sendPromotionInvitationEmail for every
 *                          invitation whose email_sent_at is still NULL.
 *                          Requires EMAIL_APP_PASSWORD env. Without this
 *                          flag, NO email is sent — you can safely inspect
 *                          the DB first.
 *     --print-tokens     — print each newly-issued plaintext token to
 *                          stdout for local testing. NEVER pass this in
 *                          shared environments.
 *     --keywords         — optional. Comma-separated match strings; when
 *                          set, only listings whose title or brand
 *                          case-insensitively contains one of them are
 *                          eligible. Omit for a site-wide sale.
 *     --status           — DRAFT | ACTIVE. Defaults to DRAFT.
 */

import dotenv from "dotenv";
dotenv.config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
    hashInvitationToken,
    makeInvitationToken,
} from "@/lib/promotions/invitation-token";
// NB: `@/lib/email` builds its Nodemailer transporter at module-import
// time from process.env.EMAIL_USER / EMAIL_APP_PASSWORD. Because ESM
// hoists all imports to run before top-of-file code, doing a normal
// `import { sendPromotionInvitationEmail } from "@/lib/email"` here would
// load the transporter BEFORE dotenv.config() populates the env vars —
// resulting in `Missing credentials for "PLAIN"` at send time. We import
// dynamically after config below.

// Mirror src/lib/prisma.ts — Prisma 7 in this codebase requires the pg
// adapter with an explicit connection string, not a bare `new PrismaClient()`.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set — did you `dotenv.config()` a file that has it?");
}
const adapter = new PrismaPg({ connectionString } as any);
const prisma = new PrismaClient({ adapter });

type Args = {
    slug: string;
    name: string;
    startsAt: Date;
    endsAt: Date;
    discountPercent: number;
    keywords: string[];
    status: "DRAFT" | "ACTIVE";
    dryRun: boolean;
    sendEmails: boolean;
    printTokens: boolean;
};

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    function pull(flag: string): string | null {
        const idx = argv.findIndex((a) => a === flag);
        if (idx === -1 || idx === argv.length - 1) return null;
        return argv[idx + 1];
    }
    const has = (flag: string) => argv.includes(flag);

    const slug = pull("--slug") ?? "site-wide-2026";
    const name = pull("--name") ?? "Modaire Site-Wide Sale";
    const startsAtRaw = pull("--starts-at");
    const endsAtRaw = pull("--ends-at");
    const discountPercent = Number(pull("--discount-percent") ?? "15");
    // Keywords are OPTIONAL. When passed, only listings whose title or brand
    // matches one of them (case-insensitive substring) are eligible — useful
    // for brand-specific campaigns. When omitted, every AVAILABLE + APPROVED
    // listing on the marketplace is eligible; every seller with any such
    // listing gets an invitation.
    const keywordsRaw = pull("--keywords");
    const keywords = keywordsRaw
        ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
        : [];
    const statusRaw = (pull("--status") ?? "DRAFT").toUpperCase();
    const status: "DRAFT" | "ACTIVE" =
        statusRaw === "ACTIVE" ? "ACTIVE" : "DRAFT";

    if (!startsAtRaw || !endsAtRaw) {
        throw new Error("Must pass --starts-at and --ends-at as ISO 8601 timestamps.");
    }
    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        throw new Error("Invalid --starts-at or --ends-at.");
    }
    if (endsAt <= startsAt) {
        throw new Error("--ends-at must be after --starts-at.");
    }
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 90) {
        throw new Error("--discount-percent must be an integer between 1 and 90.");
    }

    return {
        slug,
        name,
        startsAt,
        endsAt,
        discountPercent,
        keywords,
        status,
        dryRun: has("--dry-run"),
        sendEmails: has("--send-emails"),
        printTokens: has("--print-tokens"),
    };
}

async function run() {
    const args = parseArgs();
    console.log("=== Promotion Campaign Generator ===");
    console.log(`  Slug:            ${args.slug}`);
    console.log(`  Name:            ${args.name}`);
    console.log(`  Discount:        ${args.discountPercent}%`);
    console.log(`  Window:          ${args.startsAt.toISOString()} → ${args.endsAt.toISOString()}`);
    console.log(
        `  Scope:           ${args.keywords.length > 0 ? `keywords = [${args.keywords.join(", ")}]` : "SITE-WIDE (every AVAILABLE + APPROVED listing)"}`,
    );
    console.log(`  Status:          ${args.status}`);
    console.log(`  Dry run:         ${args.dryRun}`);
    console.log(`  Send emails:     ${args.sendEmails}`);
    console.log(`  Print tokens:    ${args.printTokens}`);
    console.log("");

    const summary = {
        campaignCreated: false,
        campaignId: "",
        eligibleSellers: 0,
        eligibleListings: 0,
        invitationsCreated: 0,
        invitationsExisting: 0,
        listingPromotionsCreated: 0,
        listingPromotionsExisting: 0,
        emailsSent: 0,
        emailsSkipped: 0,
    };
    const issuedTokens: Array<{ email: string; token: string }> = [];

    // We wrap everything except email delivery in one transaction so
    // --dry-run can throw at the end and roll back cleanly.
    const workBody = async (tx: any) => {
        // 1. Upsert campaign.
        // target_rules_json is a self-describing record of what "eligible"
        // meant for this campaign — future-proofing so a query against a
        // year-old campaign can tell whether it was site-wide or keyword
        // scoped without re-reading the launch script.
        const targetRulesJson = args.keywords.length > 0
            ? { titleContains: args.keywords, brandContains: args.keywords }
            : { scope: "SITE_WIDE" };
        const existingCampaign = await tx.promotionCampaign.findUnique({
            where: { slug: args.slug },
        });
        let campaign;
        if (existingCampaign) {
            campaign = existingCampaign;
            summary.campaignCreated = false;
        } else {
            campaign = await tx.promotionCampaign.create({
                data: {
                    name: args.name,
                    slug: args.slug,
                    discount_type: "PERCENT",
                    discount_percent: args.discountPercent,
                    status: args.status,
                    starts_at: args.startsAt,
                    ends_at: args.endsAt,
                    target_rules_json: targetRulesJson,
                },
            });
            summary.campaignCreated = true;
        }
        summary.campaignId = campaign.id;

        // 2. Find eligible listings. When keywords are provided we filter to
        // title/brand matches; when omitted the campaign is site-wide and
        // every AVAILABLE + APPROVED listing counts. Sellers still pick
        // per-listing on the approval page — nothing gets discounted
        // automatically here.
        const whereClause: Record<string, unknown> = {
            status: "AVAILABLE",
            moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
        };
        if (args.keywords.length > 0) {
            whereClause.OR = args.keywords.flatMap((kw) => [
                { title: { contains: kw, mode: "insensitive" as const } },
                { brand: { contains: kw, mode: "insensitive" as const } },
            ]);
        }
        const eligibleListings = await tx.listing.findMany({
            where: whereClause,
            select: {
                id: true,
                title: true,
                user_id: true,
                user: { select: { id: true, email: true, first_name: true, last_name: true } },
            },
        });
        summary.eligibleListings = eligibleListings.length;

        // 3. Group by seller, filtering to sellers with an email address.
        const bySeller = new Map<string, {
            seller: { id: string; email: string | null; first_name: string; last_name: string };
            listings: typeof eligibleListings;
        }>();
        for (const l of eligibleListings) {
            if (!l.user?.email) continue;
            const bucket = bySeller.get(l.user_id) ?? { seller: l.user, listings: [] };
            bucket.listings.push(l);
            bySeller.set(l.user_id, bucket);
        }
        summary.eligibleSellers = bySeller.size;

        // 4. Upsert PromotionInvitation + ListingPromotion per seller.
        for (const [sellerId, bucket] of bySeller.entries()) {
            const existingInvite = await tx.promotionInvitation.findUnique({
                where: {
                    promotion_campaign_id_seller_id: {
                        promotion_campaign_id: campaign.id,
                        seller_id: sellerId,
                    },
                },
            });

            let plaintextToken: string | null = null;
            if (existingInvite) {
                summary.invitationsExisting += 1;
            } else {
                plaintextToken = makeInvitationToken();
                // Invitation stays valid until the campaign ends. Originally
                // set to starts_at (so new opt-ins closed when the sale went
                // live), but for campaigns where starts_at is now/past that
                // would expire immediately. Ends_at is the safer bound for
                // both cases and lets sellers still opt in mid-campaign.
                await tx.promotionInvitation.create({
                    data: {
                        promotion_campaign_id: campaign.id,
                        seller_id: sellerId,
                        token_hash: hashInvitationToken(plaintextToken),
                        expires_at: args.endsAt,
                    },
                });
                summary.invitationsCreated += 1;
                if (args.printTokens && bucket.seller.email) {
                    issuedTokens.push({ email: bucket.seller.email, token: plaintextToken });
                }
            }

            // For each eligible listing, upsert a ListingPromotion at
            // INVITED status. Do NOT overwrite ACCEPTED / DECLINED.
            for (const listing of bucket.listings) {
                const existing = await tx.listingPromotion.findUnique({
                    where: {
                        promotion_campaign_id_listing_id: {
                            promotion_campaign_id: campaign.id,
                            listing_id: listing.id,
                        },
                    },
                });
                if (existing) {
                    summary.listingPromotionsExisting += 1;
                    continue;
                }
                await tx.listingPromotion.create({
                    data: {
                        promotion_campaign_id: campaign.id,
                        listing_id: listing.id,
                        seller_id: sellerId,
                        status: "INVITED",
                        discount_percent: args.discountPercent,
                    },
                });
                summary.listingPromotionsCreated += 1;
            }
        }

        if (args.dryRun) {
            // Rollback the whole transaction — throw a specific error we can
            // catch below without treating as a real failure.
            throw new Error("__DRY_RUN__");
        }
    };

    try {
        await prisma.$transaction(workBody);
    } catch (err: any) {
        if (err?.message === "__DRY_RUN__") {
            console.log("✅ Dry run complete — transaction rolled back.\n");
        } else {
            console.error("❌ Transaction failed:", err);
            process.exitCode = 1;
            await prisma.$disconnect();
            return;
        }
    }

    // 5. Email dispatch (only outside the transaction — sending mail
    // shouldn't hold a DB lock).
    if (args.sendEmails && !args.dryRun) {
        // Dynamic import so email.ts's transporter reads env vars that
        // dotenv already loaded — see NB at top of file.
        const { sendPromotionInvitationEmail } = await import("@/lib/email");
        // getAppUrl() reads Next request headers which don't exist outside a
        // request. Fall back to the env var — same behavior getAppUrl uses
        // when the request isn't available.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
            ?? process.env.AUTH_URL
            ?? process.env.NEXTAUTH_URL
            ?? "https://shopmodaire.com";

        // Fetch all invitations for this campaign that haven't emailed yet.
        const pending = await prisma.promotionInvitation.findMany({
            where: {
                promotion_campaign_id: summary.campaignId,
                email_sent_at: null,
            },
            include: {
                seller: { select: { email: true, first_name: true, last_name: true } },
                promotion_campaign: { select: { name: true, discount_percent: true, starts_at: true, ends_at: true } },
            },
        });

        // We don't have plaintext tokens for pre-existing invites — those
        // were only exposed at creation time (never re-derivable from the
        // hash). We can only send emails for invites we created THIS run
        // AND recorded the plaintext for.
        const tokenByEmail = new Map(issuedTokens.map((it) => [it.email, it.token]));

        for (const invite of pending) {
            const email = invite.seller.email;
            if (!email) {
                summary.emailsSkipped += 1;
                continue;
            }
            const token = tokenByEmail.get(email);
            if (!token) {
                // Pre-existing invite whose token we cannot recover. Print
                // a hint so the operator knows to reissue if truly needed.
                summary.emailsSkipped += 1;
                console.log(
                    `  ⚠️  Skipping ${email}: token was created in a prior run and cannot be re-emailed. Manually delete the PromotionInvitation row and re-run to reissue.`,
                );
                continue;
            }

            const secureLink = `${appUrl}/promotions/approve/${token}`;
            const listingCount = await prisma.listingPromotion.count({
                where: { promotion_campaign_id: summary.campaignId, seller_id: invite.seller_id },
            });
            const sellerName = `${invite.seller.first_name || ""} ${invite.seller.last_name || ""}`.trim();
            await sendPromotionInvitationEmail(
                email,
                sellerName,
                invite.promotion_campaign.name,
                invite.promotion_campaign.discount_percent,
                secureLink,
                listingCount,
                invite.promotion_campaign.starts_at,
                invite.promotion_campaign.ends_at,
                invite.expires_at,
            );
            await prisma.promotionInvitation.update({
                where: { id: invite.id },
                data: { email_sent_at: new Date() },
            });
            summary.emailsSent += 1;
        }
    }

    // 6. Print summary + tokens (if requested).
    console.log("=== Summary ===");
    console.log(`  Campaign:                   ${summary.campaignCreated ? "created" : "reused"} (${summary.campaignId})`);
    console.log(`  Eligible sellers:           ${summary.eligibleSellers}`);
    console.log(`  Eligible listings:          ${summary.eligibleListings}`);
    console.log(`  Invitations created:        ${summary.invitationsCreated}`);
    console.log(`  Invitations already there:  ${summary.invitationsExisting}`);
    console.log(`  Listing promotions created: ${summary.listingPromotionsCreated}`);
    console.log(`  Listing promotions kept:    ${summary.listingPromotionsExisting}`);
    if (args.sendEmails) {
        console.log(`  Emails sent:                ${summary.emailsSent}`);
        console.log(`  Emails skipped:             ${summary.emailsSkipped}`);
    }
    if (args.printTokens && issuedTokens.length > 0) {
        console.log("\n--- Plaintext tokens (NEVER share outside dev) ---");
        for (const it of issuedTokens) {
            console.log(`  ${it.email}: ${it.token}`);
        }
    }

    await prisma.$disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
