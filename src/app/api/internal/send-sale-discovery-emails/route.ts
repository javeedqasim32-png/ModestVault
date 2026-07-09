import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSaleDiscoveryEmail } from "@/lib/email";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * "Your saved item just went on sale" — cron-driven email for users who
 * have a listing in their cart or favorites when that listing becomes
 * discounted.
 *
 * Fires at most ONCE per (user, listing) pair for the life of the site.
 * Guaranteed by the unique constraint on SaleDiscoveryEmail(user_id,
 * listing_id). Removing + re-adding to cart, sale ending + restarting,
 * seller re-accepting a new campaign — none of these re-arm the notification.
 *
 * "Only after" gate: we only email when the user added the item BEFORE
 * the discount started. Users who add a listing that's already discounted
 * don't get an email — they already saw the sale price on the tile when
 * they added it. The discount's "start time" is max(listingPromotion
 * .accepted_at, campaign.starts_at) — the moment both gates aligned.
 *
 * Recommended schedule: every 15 minutes.
 *
 * Auth: x-cron-secret header against INTERNAL_CRON_SECRET.
 */
function isAuthorized(request: Request) {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    const provided = request.headers.get("x-cron-secret");
    return provided === expected;
}

const MAX_LISTINGS_PER_RUN = 200;

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // 1. Find every currently-discounted listing, along with the exact
    // moment the discount became active (max of listingPromotion
    // accepted_at and campaign starts_at). We also fetch listing title +
    // price + image inline to build the email later without a second
    // per-listing query.
    const activePromotions = await prisma.listingPromotion.findMany({
        where: {
            status: "ACCEPTED",
            accepted_at: { not: null },
            promotion_campaign: {
                status: "ACTIVE",
                starts_at: { lte: now },
                ends_at: { gte: now },
            },
            listing: { status: "AVAILABLE" },
        },
        take: MAX_LISTINGS_PER_RUN,
        select: {
            discount_percent: true,
            accepted_at: true,
            promotion_campaign: { select: { starts_at: true } },
            listing: {
                select: {
                    id: true,
                    title: true,
                    price: true,
                    image_url: true,
                    images: {
                        orderBy: { imageOrder: "asc" },
                        take: 1,
                        select: { thumbUrl: true, mediumUrl: true, imageUrl: true },
                    },
                },
            },
        },
    });

    if (activePromotions.length === 0) {
        return NextResponse.json({ scanned: 0, listings: 0, emailed: 0 });
    }

    // 2. For each discounted listing, find (user, listing) pairs where:
    //    a. The user has it in their cart or favorites
    //    b. The user added it BEFORE the discount started (only-after gate)
    //    c. No SaleDiscoveryEmail row exists yet
    //
    // We do this per-listing rather than one giant query because the
    // "only-after" cutoff (discountStartedAt) varies by listing.
    type PendingItem = {
        listingId: string;
        title: string;
        originalPrice: number;
        salePrice: number;
        discountPercent: number;
        thumbUrl: string | null;
    };
    // userId → { email, firstName, items[] }
    const perUser = new Map<
        string,
        { email: string; firstName: string; items: PendingItem[] }
    >();

    for (const promo of activePromotions) {
        const discountStartedAt =
            promo.accepted_at && promo.accepted_at > promo.promotion_campaign.starts_at
                ? promo.accepted_at
                : promo.promotion_campaign.starts_at;
        const listing = promo.listing;
        const originalPrice = Number(listing.price);
        const salePrice =
            Math.round((originalPrice * (100 - promo.discount_percent))) / 100;

        // Cart entries added before the discount started.
        const cartMatches = await prisma.cartItem.findMany({
            where: {
                listing_id: listing.id,
                created_at: { lt: discountStartedAt },
            },
            select: {
                user_id: true,
                user: {
                    select: {
                        email: true,
                        first_name: true,
                        is_admin: true,
                    },
                },
            },
        });

        // Favorites added before the discount started. Prisma favorites
        // are on the FavoriteItem model.
        const favoriteMatches = await prisma.favoriteItem.findMany({
            where: {
                listing_id: listing.id,
                created_at: { lt: discountStartedAt },
            },
            select: {
                user_id: true,
                user: {
                    select: {
                        email: true,
                        first_name: true,
                        is_admin: true,
                    },
                },
            },
        });

        // Merge cart + favorites, dedup by user_id. Skip admin accounts
        // and users without an email.
        const candidateUsers = new Map<
            string,
            { email: string; firstName: string }
        >();
        for (const row of [...cartMatches, ...favoriteMatches]) {
            if (!row.user?.email || row.user.is_admin) continue;
            if (candidateUsers.has(row.user_id)) continue;
            candidateUsers.set(row.user_id, {
                email: row.user.email,
                firstName: row.user.first_name,
            });
        }
        if (candidateUsers.size === 0) continue;

        // Filter out users we've already emailed about this listing.
        const alreadyEmailed = await prisma.saleDiscoveryEmail.findMany({
            where: {
                listing_id: listing.id,
                user_id: { in: Array.from(candidateUsers.keys()) },
            },
            select: { user_id: true },
        });
        const emailedSet = new Set(alreadyEmailed.map((r) => r.user_id));

        const rawThumb = getPrimaryListingImage(
            {
                image_url: listing.image_url,
                images: listing.images,
            },
            "card",
        );
        const thumbUrl = rawThumb && rawThumb.length > 0 ? rawThumb : null;

        for (const [userId, meta] of candidateUsers) {
            if (emailedSet.has(userId)) continue;
            const bucket = perUser.get(userId) ?? {
                email: meta.email,
                firstName: meta.firstName,
                items: [],
            };
            bucket.items.push({
                listingId: listing.id,
                title: listing.title,
                originalPrice,
                salePrice,
                discountPercent: promo.discount_percent,
                thumbUrl,
            });
            perUser.set(userId, bucket);
        }
    }

    if (perUser.size === 0) {
        return NextResponse.json({
            scanned: activePromotions.length,
            listings: 0,
            emailed: 0,
        });
    }

    // 3. Send + record. Insert the SaleDiscoveryEmail rows AFTER a
    // successful email send — otherwise a mid-run crash would mark
    // pairs as done that never actually got a notification.
    const appUrl = await getAppUrl();
    let emailed = 0;
    for (const [userId, bucket] of perUser) {
        const items = bucket.items.map((it) => ({
            title: it.title,
            originalPrice: it.originalPrice,
            salePrice: it.salePrice,
            discountPercent: it.discountPercent,
            thumbUrl: it.thumbUrl,
            listingUrl: `${appUrl}/listings/${it.listingId}`,
        }));
        try {
            await sendSaleDiscoveryEmail(bucket.email, bucket.firstName, items);
            // On success, record each (user, listing) pair. skipDuplicates
            // shrugs off the (unlikely) case where a concurrent run inserted
            // the same pair between our earlier check and now.
            await prisma.saleDiscoveryEmail.createMany({
                data: bucket.items.map((it) => ({
                    user_id: userId,
                    listing_id: it.listingId,
                })),
                skipDuplicates: true,
            });
            emailed += 1;
        } catch (err) {
            console.error(
                "[send-sale-discovery-emails] email failed for",
                bucket.email,
                err,
            );
            // No stamp — try again next run.
        }
    }

    return NextResponse.json({
        scanned: activePromotions.length,
        recipients: perUser.size,
        emailed,
    });
}
