/**
 * One-off broadcast: pure "showcase" email to every opted-in Modaire
 * user featuring 3 (or up to 4, hero + 3 grid) hand-picked listings.
 * No discount, no countdown — just a browse-y editorial send.
 *
 * Sibling of scripts/send-sale-broadcast.ts. The sale variant requires
 * an ACTIVE PromotionCampaign; this one has no such dependency —
 * listings just need to exist and be AVAILABLE.
 *
 * Usage:
 *   # Dry run — no DB writes, no emails, prints who WOULD receive:
 *   npx tsx scripts/send-showcase-email.ts \
 *     --listings https://shopmodaire.com/listings/<id1>,<id2>,<id3> \
 *     --slug 2026-07-new-on-modaire \
 *     --dry-run
 *
 *   # Preview — send only to one address so you can eyeball the layout:
 *   npx tsx scripts/send-showcase-email.ts \
 *     --listings <id1>,<id2>,<id3> \
 *     --slug 2026-07-new-on-modaire \
 *     --preview qasimjaveed19@gmail.com
 *
 *   # Full send — throttled 5/min, expect ~1 hour for 300 users:
 *   npx tsx scripts/send-showcase-email.ts \
 *     --listings <id1>,<id2>,<id3> \
 *     --slug 2026-07-new-on-modaire
 *
 * Required flags:
 *   --listings <ids-or-urls>  Comma-separated list of 1-4 listing IDs OR
 *                             full listing URLs (first = hero, next 3 =
 *                             grid tiles). Extracts the id from any URL
 *                             matching .../listings/<id>. Every listing
 *                             must have status=AVAILABLE and be
 *                             admin-approved or partial-approved.
 *   --slug <slug>             broadcast_slug used for MarketingEmailDelivery
 *                             idempotency. REQUIRED so re-runs of the same
 *                             broadcast are safe by construction (no
 *                             auto-generated slugs that could collide).
 *
 * Optional flags:
 *   --headline "..."          Big headline over the hero (default: "New On Modaire")
 *   --subheadline "..."       Smaller line under the headline
 *                             (default: "Freshly listed pieces from our community's closets.")
 *   --subject "..."           Email subject (default: "New On Modaire — freshly listed pieces")
 *   --preview <email>         Send only to one specific user email
 *   --max 300                 Cap total sends this run (safety valve)
 *   --sleep-ms 12000          Milliseconds between sends (default 12000)
 *   --dry-run                 Print recipients + curated items, send nothing
 *
 * Idempotency: each (broadcast_slug, user_id) pair inserts one row into
 * MarketingEmailDelivery. Re-running the same command skips users who
 * already got the broadcast — safe to Ctrl-C mid-batch and resume.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sendShowcaseBroadcastEmail } from "../src/lib/email";
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
const headline = args["headline"] || "New On Modaire";
const subheadline = args["subheadline"] || "Freshly listed pieces from our community's closets.";
const subject = args["subject"] || "New On Modaire — freshly listed pieces";

if (!args["slug"]) {
    console.error("--slug <slug> is required (used for MarketingEmailDelivery idempotency).");
    console.error("Example: --slug 2026-07-new-on-modaire");
    process.exit(1);
}
const broadcastSlug = args["slug"];

if (!args["listings"]) {
    console.error("--listings is required. Pass 1-4 listing ids or URLs, comma-separated.");
    console.error("Example: --listings https://shopmodaire.com/listings/abc,def,ghi");
    process.exit(1);
}

function parseManualListings(raw: string): string[] {
    const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (parts.length === 0) {
        console.error("--listings was empty after parsing.");
        process.exit(1);
    }
    if (parts.length > 4) {
        console.error(`--listings takes at most 4 ids (first = hero, next 3 = grid). Got ${parts.length}.`);
        process.exit(1);
    }
    return parts.map((p) => {
        const m = p.match(/\/listings\/([^/?#]+)/);
        return m ? m[1] : p;
    });
}

const manualIds = parseManualListings(args["listings"]);

// -------- prisma --------

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// -------- main --------

async function main() {
    console.log(`Broadcast slug: ${broadcastSlug}`);
    console.log(`Headline: ${headline}`);
    console.log(`Subject: ${subject}`);
    console.log(`Listings requested: ${manualIds.join(", ")}`);

    // 1. Fetch the selected listings. AVAILABLE + admin-approved only —
    //    we don't want to email out a link to a listing that just went
    //    into moderation limbo.
    const listings = await prisma.listing.findMany({
        where: {
            id: { in: manualIds },
            status: "AVAILABLE",
            moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
        },
        select: {
            id: true,
            title: true,
            price: true,
            image_url: true,
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { thumbUrl: true, mediumUrl: true, imageUrl: true, imageOrder: true },
            },
        },
    });

    // Preserve caller-supplied order (first = hero, next 3 = grid).
    const byId = new Map(listings.map((l) => [l.id, l]));
    const missing = manualIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
        console.error(`Some listings were not found, not AVAILABLE, or not admin-approved:`);
        for (const id of missing) console.error(`  - ${id}`);
        process.exit(1);
    }
    const ordered = manualIds
        .map((id) => byId.get(id))
        .filter((l): l is (typeof listings)[number] => Boolean(l));

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://shopmodaire.com").replace(/\/$/, "");
    const featured = ordered.map((l) => {
        const rawThumb = getPrimaryListingImage(
            { image_url: l.image_url, images: l.images },
            "card",
        );
        const thumbUrl = rawThumb && rawThumb.length > 0 ? rawThumb : null;
        const priceNum = Number(l.price);
        return {
            listingId: l.id,
            title: l.title,
            price: `$${priceNum.toFixed(2)}`,
            thumbUrl,
        };
    });
    console.log(`Curated ${featured.length} items:`);
    for (const it of featured) {
        console.log(`  - ${it.title} — ${it.price}`);
    }

    // 2. Build recipient list.
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

    // 3. Filter out already-delivered.
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

    // 4. Send loop.
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < total; i++) {
        const r = todo[i];
        const unsubscribeUrl = buildUnsubscribeUrl(r.id);
        const items = featured.map((f) => ({
            title: f.title,
            price: f.price,
            thumbUrl: f.thumbUrl,
            listingUrl: `${appUrl}/listings/${f.listingId}`,
        }));

        let errMsg: string | null = null;
        try {
            await sendShowcaseBroadcastEmail({
                email: r.email,
                firstName: r.first_name || "",
                headline,
                subheadline,
                subject,
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
        // operator inspects, decides, and manually deletes rows to retry.
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
