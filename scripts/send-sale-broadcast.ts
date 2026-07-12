/**
 * One-off broadcast: promotional email to every opted-in Modaire user
 * announcing an active sale. Curates the top 4 discounted items from
 * an ACTIVE PromotionCampaign and sends via the existing Gmail SMTP
 * transporter (light-throttled to stay under Gmail's ~14/min soft cap).
 *
 * Not a cron — invoked manually when you decide to send a broadcast.
 *
 * Usage:
 *   # Dry run — no DB writes, no emails, prints who WOULD receive and what:
 *   npx tsx scripts/send-sale-broadcast.ts --dry-run
 *
 *   # Preview — send only to one address so you can eyeball the layout:
 *   npx tsx scripts/send-sale-broadcast.ts --preview qasimjaveed19@gmail.com
 *
 *   # Full send — throttled 5/min, expect ~1 hour for 300 users:
 *   npx tsx scripts/send-sale-broadcast.ts
 *
 * Optional flags:
 *   --slug summer-sale-2026-07  Override the broadcast_slug used for
 *                               idempotency (default: derived from campaign)
 *   --max 300                   Cap total sends this run (safety valve)
 *   --sleep-ms 12000            Milliseconds between sends (default 12000)
 *
 * Idempotency: each (broadcast_slug, user_id) pair inserts one row into
 * MarketingEmailDelivery. Re-running the same command skips users who
 * already got the broadcast — safe to Ctrl-C mid-batch and resume.
 */

// Standalone script — tsx doesn't auto-load .env, so we do it here so
// DATABASE_URL / EMAIL_USER / AUTH_SECRET / etc. all resolve when this
// file is run directly.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sendSaleBroadcastEmail } from "../src/lib/email";
import { getPrimaryListingImage } from "../src/lib/listing-images";
import { buildUnsubscribeUrl } from "../src/lib/unsubscribe";

// -------- args --------

function parseArgs() {
    const args = process.argv.slice(2);
    const out: Record<string, string> = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a.startsWith("--")) continue;
        const key = a.slice(2);
        const val = args[i + 1];
        if (!val || val.startsWith("--")) {
            out[key] = "true";
        } else {
            out[key] = val;
            i += 1;
        }
    }
    return out;
}

const args = parseArgs();
const isDryRun = args["dry-run"] === "true";
const previewEmail = args["preview"] || null;
const maxSends = args["max"] ? Math.max(1, Number(args["max"])) : Infinity;
const sleepMs = args["sleep-ms"] ? Math.max(0, Number(args["sleep-ms"])) : 12_000;

// -------- prisma --------

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// -------- main --------

async function main() {
    const now = new Date();

    // 1. Find the currently active promotion campaign. If there are
    //    multiple, pick the one whose starts_at is most recent — the
    //    "latest active" heuristic. Fine for the common case of one
    //    campaign at a time.
    const campaign = await prisma.promotionCampaign.findFirst({
        where: {
            status: "ACTIVE",
            starts_at: { lte: now },
            ends_at: { gte: now },
        },
        orderBy: { starts_at: "desc" },
    });
    if (!campaign) {
        console.error("No ACTIVE PromotionCampaign found — nothing to broadcast.");
        process.exit(1);
    }
    const broadcastSlug = args["slug"] || `${campaign.slug}-broadcast`;
    const discountLabel = `${campaign.discount_percent}% Off`;
    console.log(`Campaign: ${campaign.name} (${discountLabel}) — broadcast_slug=${broadcastSlug}`);

    // 2. Curate the top 4 discounted, still-available, admin-approved
    //    listings. Prefer featured; break ties by featured_order + recency.
    const listingPromotions = await prisma.listingPromotion.findMany({
        where: {
            promotion_campaign_id: campaign.id,
            status: "ACCEPTED",
            listing: {
                status: "AVAILABLE",
                moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
            },
        },
        include: {
            listing: {
                select: {
                    id: true,
                    title: true,
                    price: true,
                    image_url: true,
                    is_featured: true,
                    featured_order: true,
                    created_at: true,
                    images: {
                        orderBy: { imageOrder: "asc" },
                        take: 1,
                        select: { thumbUrl: true, mediumUrl: true, imageUrl: true, imageOrder: true },
                    },
                },
            },
        },
    });
    if (listingPromotions.length === 0) {
        console.error("No ACCEPTED listings on the active campaign — nothing to feature.");
        process.exit(1);
    }
    // Custom sort (Prisma can't express desc-featured + asc-order-nulls-last + desc-created)
    listingPromotions.sort((a, b) => {
        const af = a.listing.is_featured ? 0 : 1;
        const bf = b.listing.is_featured ? 0 : 1;
        if (af !== bf) return af - bf;
        const ao = a.listing.featured_order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.listing.featured_order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return b.listing.created_at.getTime() - a.listing.created_at.getTime();
    });
    const featured = listingPromotions.slice(0, 4).map((lp) => {
        const originalPrice = Number(lp.listing.price);
        const salePrice = Math.round(originalPrice * (100 - lp.discount_percent)) / 100;
        const rawThumb = getPrimaryListingImage(
            {
                image_url: lp.listing.image_url,
                images: lp.listing.images,
            },
            "card",
        );
        const thumbUrl = rawThumb && rawThumb.length > 0 ? rawThumb : null;
        return {
            listingId: lp.listing.id,
            title: lp.listing.title,
            originalPrice,
            salePrice,
            discountPercent: lp.discount_percent,
            thumbUrl,
        };
    });
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://shopmodaire.com").replace(/\/$/, "");
    console.log(`Curated ${featured.length} items:`);
    for (const it of featured) {
        console.log(`  - ${it.title} — $${it.originalPrice} → $${it.salePrice} (${it.discountPercent}% off)`);
    }

    // 3. Build recipient list.
    let recipients;
    if (previewEmail) {
        recipients = await prisma.user.findMany({
            where: { email: previewEmail },
            select: { id: true, email: true, first_name: true },
        });
        if (recipients.length === 0) {
            console.error(`No user found with email=${previewEmail} — preview aborted.`);
            process.exit(1);
        }
    } else {
        recipients = await prisma.user.findMany({
            where: {
                marketing_email_opt_in: true,
                is_admin: false,
                email: { not: "" },
                deleted_at: null,
            },
            select: { id: true, email: true, first_name: true },
            orderBy: { created_at: "asc" },
        });
    }

    // 4. Filter out already-delivered.
    const alreadySent = await prisma.marketingEmailDelivery.findMany({
        where: {
            broadcast_slug: broadcastSlug,
            user_id: { in: recipients.map((r) => r.id) },
        },
        select: { user_id: true },
    });
    const sentSet = new Set(alreadySent.map((r) => r.user_id));
    const todo = recipients.filter((r) => !sentSet.has(r.id));
    const total = Math.min(todo.length, maxSends);

    console.log(
        `Recipients: ${recipients.length} eligible, ${sentSet.size} already sent, ${total} to send this run.`,
    );

    if (isDryRun) {
        console.log("\n--- DRY RUN — nothing sent, nothing written. ---");
        console.log("First 5 recipients:");
        todo.slice(0, 5).forEach((r) => console.log(`  - ${r.email} (${r.first_name})`));
        await prisma.$disconnect();
        return;
    }

    if (total === 0) {
        console.log("Nothing to do.");
        await prisma.$disconnect();
        return;
    }

    // 5. Send loop.
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < total; i++) {
        const r = todo[i];
        const unsubscribeUrl = buildUnsubscribeUrl(r.id);
        const items = featured.map((f) => ({
            title: f.title,
            originalPrice: f.originalPrice,
            salePrice: f.salePrice,
            discountPercent: f.discountPercent,
            thumbUrl: f.thumbUrl,
            listingUrl: `${appUrl}/listings/${f.listingId}`,
        }));

        let errMsg: string | null = null;
        try {
            await sendSaleBroadcastEmail({
                email: r.email,
                firstName: r.first_name || "",
                discountLabel,
                campaignName: campaign.name,
                campaignEndsAt: campaign.ends_at,
                unsubscribeUrl,
                items,
            });
            sent += 1;
        } catch (err) {
            failed += 1;
            errMsg = err instanceof Error ? err.message : String(err);
            console.error(`  ✗ ${r.email}: ${errMsg}`);
        }

        // Record the attempt either way — success or failure. Failed
        // rows record error text and are NOT auto-retried on a re-run;
        // the operator inspects, decides, and manually deletes rows they
        // want retried.
        try {
            await prisma.marketingEmailDelivery.create({
                data: {
                    broadcast_slug: broadcastSlug,
                    user_id: r.id,
                    error: errMsg,
                },
            });
        } catch {
            // Unique-constraint race — the row exists, treat as sent.
        }

        console.log(`  ${sent + failed}/${total} • sent=${sent} failed=${failed} • ${r.email}`);

        if (i < total - 1 && sleepMs > 0) {
            await new Promise((res) => setTimeout(res, sleepMs));
        }
    }

    console.log(`\nDone. sent=${sent} failed=${failed} broadcast_slug=${broadcastSlug}`);
    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
