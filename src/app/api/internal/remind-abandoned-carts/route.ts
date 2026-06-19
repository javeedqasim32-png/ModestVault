import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendCartReminderEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * Cron-driven cart-abandonment reminder. Runs two passes per
 * invocation:
 *
 *   Pass A — first nudge at 48h:
 *     CartItem rows older than 48h with first_reminded_at IS NULL.
 *
 *   Pass B — second nudge at 7 days after the first reminder:
 *     CartItem rows where first_reminded_at < NOW() - 7d and
 *     second_reminded_at IS NULL.
 *
 * Both passes:
 *   - skip listings that aren't AVAILABLE (sold-out items shouldn't
 *     get reminders)
 *   - skip rows where a Purchase already exists for the same
 *     (user_id, listing_id) — guards against a race where checkout
 *     fired between the query and the email send
 *   - group by user and send one summary email per user
 *   - stamp the corresponding *_reminded_at column so future runs skip
 *     the same row
 *
 * Auth: `x-cron-secret` header against INTERNAL_CRON_SECRET.
 * Recommended schedule: hourly (`0 * * * *`).
 */
function isAuthorized(request: Request) {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    const provided = request.headers.get("x-cron-secret");
    return provided === expected;
}

const MAX_PER_PASS = 500;

type CartRowForReminder = {
    id: string;
    user_id: string;
    listing_id: string;
    user: { id: string; email: string | null; is_admin: boolean };
    listing: {
        id: string;
        title: string;
        price: { toString(): string } | number;
        image_url: string;
    };
};

type Pass = "first" | "second";

async function runPass(
    pass: Pass,
    appUrl: string,
): Promise<{ scanned: number; emailed: number; stamped: number }> {
    const now = new Date();
    const ageGate = pass === "first"
        ? { created_at: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) } }
        : {
              first_reminded_at: {
                  not: null,
                  lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              },
          };
    const idempotencyGate = pass === "first"
        ? { first_reminded_at: null }
        : { second_reminded_at: null };

    const rows = (await prisma.cartItem.findMany({
        where: {
            ...idempotencyGate,
            ...ageGate,
            listing: { status: "AVAILABLE" },
        },
        take: MAX_PER_PASS,
        orderBy: { created_at: "asc" },
        include: {
            user: { select: { id: true, email: true, is_admin: true } },
            listing: {
                select: {
                    id: true,
                    title: true,
                    price: true,
                    image_url: true,
                },
            },
        },
    })) as unknown as CartRowForReminder[];

    if (rows.length === 0) {
        return { scanned: 0, emailed: 0, stamped: 0 };
    }

    // Race-protection: exclude any (user_id, listing_id) pair that
    // already has a Purchase row. Cheap single query.
    const pairKeys = rows.map((r) => ({
        buyer_id: r.user_id,
        listing_id: r.listing_id,
    }));
    const purchased = await prisma.purchase.findMany({
        where: { OR: pairKeys },
        select: { buyer_id: true, listing_id: true },
    });
    const purchasedSet = new Set(
        purchased.map((p) => `${p.buyer_id}::${p.listing_id}`),
    );
    const eligible = rows.filter(
        (r) => !purchasedSet.has(`${r.user_id}::${r.listing_id}`),
    );

    type Item = {
        title: string;
        price: number;
        thumbUrl: string | null;
        listingUrl: string;
    };
    // userId → { email, items[], rowIds[] }
    const byUser = new Map<
        string,
        { email: string; items: Item[]; rowIds: string[] }
    >();

    for (const row of eligible) {
        if (!row.user.email || row.user.is_admin) continue;
        const bucket = byUser.get(row.user.id) ?? {
            email: row.user.email,
            items: [],
            rowIds: [],
        };
        bucket.items.push({
            title: row.listing.title,
            price: Number(row.listing.price),
            thumbUrl: row.listing.image_url || null,
            listingUrl: `${appUrl}/listings/${row.listing.id}`,
        });
        bucket.rowIds.push(row.id);
        byUser.set(row.user.id, bucket);
    }

    let emailed = 0;
    const stampIds: string[] = [];
    for (const { email, items, rowIds } of byUser.values()) {
        try {
            await sendCartReminderEmail(email, items, pass);
            emailed += 1;
            stampIds.push(...rowIds);
        } catch (err) {
            console.error(
                `[remind-abandoned-carts/${pass}] email failed for`,
                email,
                err,
            );
        }
    }

    if (stampIds.length > 0) {
        const data = pass === "first"
            ? { first_reminded_at: now }
            : { second_reminded_at: now };
        await prisma.cartItem.updateMany({
            where: { id: { in: stampIds } },
            data,
        });
    }

    return { scanned: rows.length, emailed, stamped: stampIds.length };
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appUrl = await getAppUrl();
    const first = await runPass("first", appUrl);
    const second = await runPass("second", appUrl);
    return NextResponse.json({ first, second });
}
