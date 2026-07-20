import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripeBalance, createStripeDashboardLink, onboardSellerAction } from "@/app/actions/stripe";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Clock, ExternalLink, TrendingUp, AlertCircle, Package, Calendar, DollarSign } from "lucide-react";

export const dynamic = "force-dynamic";

type OrderAggregateDelegate = {
    aggregate: (args: unknown) => Promise<{
        _sum: { seller_transfer_amount_cents: number | null };
        _count: number;
    }>;
    findFirst: (args: unknown) => Promise<{ hold_until: Date | null } | null>;
};

async function handleConnectStripe() {
    "use server";
    const result = await onboardSellerAction();
    if (result?.url) redirect(result.url);
}

export default async function EarningsPage() {
    const session = await auth();
    if (!session?.user?.id) redirect("/login");

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { stripe_account_id: true }
    });

    const balance = user?.stripe_account_id
        ? await getStripeBalance(user.stripe_account_id)
        : { available: 0, pending: 0, currency: "USD" };

    const orderDelegate = (prisma as unknown as { order: OrderAggregateDelegate }).order;
    const awaitingAggregate = await orderDelegate.aggregate({
        where: {
            seller_transfer_status: "AWAITING_SELLER_STRIPE",
            seller_transfer_id: null,
            purchase: { listing: { user_id: session.user.id } },
        },
        _sum: { seller_transfer_amount_cents: true },
        _count: true,
    });
    const awaitingCents = awaitingAggregate._sum.seller_transfer_amount_cents ?? 0;
    const awaitingCount = awaitingAggregate._count ?? 0;
    const awaitingDollars = awaitingCents / 100;

    // Held payouts — the 3-day buyer-review window between delivery and
    // Stripe transfer. Money exists on the Order row but hasn't been sent
    // to Stripe yet, so Stripe's own "Pending" balance shows $0 for it.
    // Without this card, sellers see nothing during the hold and think
    // their payout vanished.
    const now = new Date();
    const heldWhere = {
        seller_transfer_status: "PENDING_HOLD",
        delivered_at: { not: null },
        hold_until: { gt: now },
        purchase: { listing: { user_id: session.user.id } },
    };
    const [heldAggregate, nextRelease] = await Promise.all([
        orderDelegate.aggregate({
            where: heldWhere,
            _sum: { seller_transfer_amount_cents: true },
            _count: true,
        }),
        // Earliest hold_until across all held orders — drives the
        // "Estimated availability: {date}" copy on the Pending tile.
        orderDelegate.findFirst({
            where: heldWhere,
            orderBy: { hold_until: "asc" },
            select: { hold_until: true },
        }),
    ]);
    const heldCents = heldAggregate._sum.seller_transfer_amount_cents ?? 0;
    const heldCount = heldAggregate._count ?? 0;
    const heldDollars = heldCents / 100;
    const estimatedAvailability = heldCount > 0 && nextRelease?.hold_until
        ? nextRelease.hold_until
        : null;

    // KPI strip data — lifetime + this month + last month + count.
    // Dollar KPIs (Lifetime/This Month/Last Month) count ONLY orders that
    // have been paid out (RELEASED) — that's what "earned" means to a
    // seller: money in hand, not money still in the payout pipeline. The
    // Hold/Pending/Awaiting money is already surfaced in its own tiles
    // below, so double-counting it here would be misleading.
    // Date filter uses seller_transfer_released_at (when the payout
    // actually landed) rather than created_at (when the order was made)
    // for the same reason — an order created in June but released in
    // July should count as July's earnings.
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // "Last 30 days" is a ROLLING window, not calendar-based, so the
    // number is meaningful every day of the month (calendar-based would
    // show $0 on the 1st).
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sellerScope = { purchase: { listing: { user_id: session.user.id } } };
    const releasedScope = { ...sellerScope, seller_transfer_status: "RELEASED" };
    const [lifetimeAgg, thisMonthAgg, last30DaysAgg, totalSalesCount, recentOrders] = await Promise.all([
        orderDelegate.aggregate({ where: releasedScope, _sum: { seller_transfer_amount_cents: true } }),
        orderDelegate.aggregate({
            where: { ...releasedScope, seller_transfer_released_at: { gte: startOfThisMonth } },
            _sum: { seller_transfer_amount_cents: true },
        }),
        orderDelegate.aggregate({
            where: { ...releasedScope, seller_transfer_released_at: { gte: thirtyDaysAgo } },
            _sum: { seller_transfer_amount_cents: true },
        }),
        (prisma as unknown as { order: { count: (args: unknown) => Promise<number> } }).order.count({
            where: sellerScope,
        }),
        // Recent 10 orders — feeds the activity list. Include the purchase +
        // listing so we can render item title + thumbnail + amount + status
        // without a second query.
        (prisma as unknown as {
            order: {
                findMany: (args: unknown) => Promise<Array<{
                    id: string;
                    created_at: Date;
                    delivered_at: Date | null;
                    shipping_status: string;
                    seller_transfer_status: string;
                    seller_transfer_amount_cents: number | null;
                    hold_until: Date | null;
                    purchase: {
                        amount: unknown;
                        listing: { id: string; title: string; image_url: string };
                    };
                }>>;
            };
        }).order.findMany({
            where: sellerScope,
            orderBy: { created_at: "desc" },
            take: 10,
            include: {
                purchase: {
                    select: {
                        amount: true,
                        listing: { select: { id: true, title: true, image_url: true } },
                    },
                },
            },
        }),
    ]);
    const lifetimeDollars = (lifetimeAgg._sum.seller_transfer_amount_cents ?? 0) / 100;
    const thisMonthDollars = (thisMonthAgg._sum.seller_transfer_amount_cents ?? 0) / 100;
    const last30DaysDollars = (last30DaysAgg._sum.seller_transfer_amount_cents ?? 0) / 100;

    // Pre-fetch the dashboard link so it reliably opens in a new tab. Skip for
    // sellers who haven't connected Stripe yet — there's no dashboard to link to.
    let stripeDashboardUrl = "https://dashboard.stripe.com";
    if (user?.stripe_account_id) {
        try {
            const result = await createStripeDashboardLink();
            stripeDashboardUrl = result.url;
        } catch (e) {
            console.error("Failed to generate stripe dashboard link", e);
        }
    }

    return (
        <div className="px-6 py-8 sm:px-10 lg:px-12 space-y-10" style={{ fontFamily: "var(--font-sans), sans-serif" }}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-[32px] md:text-[38px] leading-tight text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 500 }}>
                        Financial Overview
                    </h1>
                    <p className="mt-2 text-[15px] text-[#8a7667]">Track your marketplace success and payouts.</p>
                </div>

                <a
                    href={stripeDashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View payout details"
                    className="inline-flex h-10 items-center justify-center rounded-full border border-[#d9cfc7] bg-white px-4 py-2 text-sm font-medium text-[#4a3328] transition hover:bg-[#ede7df] shadow-sm"
                >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Payout Details
                </a>
            </div>

            {/* KPI STRIP — top-of-page snapshot. Thin tiles, one line each,
                dense enough to feel like a real financial dashboard header. */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiTile
                    label="Lifetime Earned"
                    value={`$${lifetimeDollars.toFixed(2)}`}
                    icon={<DollarSign className="h-[13px] w-[13px] stroke-[1.8]" />}
                />
                <KpiTile
                    label="This Month"
                    value={`$${thisMonthDollars.toFixed(2)}`}
                    icon={<TrendingUp className="h-[13px] w-[13px] stroke-[1.8]" />}
                />
                <KpiTile
                    label="Last 30 Days"
                    value={`$${last30DaysDollars.toFixed(2)}`}
                    icon={<Calendar className="h-[13px] w-[13px] stroke-[1.8]" />}
                />
                <KpiTile
                    label="Items Sold"
                    value={`${totalSalesCount} ${totalSalesCount === 1 ? "item" : "items"}`}
                    icon={<Package className="h-[13px] w-[13px] stroke-[1.8]" />}
                />
            </div>

            <div className={`grid grid-cols-1 gap-4 ${gridColumnClass(2 + (awaitingCount > 0 ? 1 : 0))}`}>
                {/* Available Balance — money sitting in the seller's
                    connected payout account, ready to be released to
                    their bank. Clicking opens the hosted payout details
                    page (Stripe Express) — the label doesn't leak that. */}
                <a
                    href={stripeDashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View payout details"
                    className="block w-full text-left rounded-[30px] border border-[#e3d9d1] bg-[#f7f2ed] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition hover:bg-[#f2ebe4]"
                >
                    <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-[#8f6e59]">
                        <span className="flex items-center gap-2">
                            <TrendingUp className="h-[15px] w-[15px] stroke-[1.7]" />
                            Available Balance
                        </span>
                        <ExternalLink className="h-[13px] w-[13px] stroke-[1.7] opacity-70" aria-hidden />
                    </div>
                    <p className="text-[28px] md:text-[32px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>
                        ${balance.available.toFixed(2)}
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.35] text-[#8a7667]">
                        Ready for payout
                    </p>
                </a>

                {/* Pending Payouts — combines the buyer-protection window
                    (Modaire's 3-day hold post-delivery) with in-transit
                    funds heading to the seller's payout account. */}
                <div className="rounded-[30px] border border-[#e3d9d1] bg-[#f7f2ed] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#8f6e59]">
                        <Clock className="h-[15px] w-[15px] stroke-[1.7]" />
                        Pending Payouts
                    </div>
                    <p className="text-[28px] md:text-[32px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>
                        ${(heldDollars + balance.pending).toFixed(2)}
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.35] text-[#8a7667]">
                        {buildPendingCopy(heldCount, heldDollars, balance.pending, estimatedAvailability)}
                    </p>
                </div>

                {awaitingCount > 0 && (
                    <div className="rounded-[30px] border border-amber-200 bg-amber-50/70 px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
                            <AlertCircle className="h-[15px] w-[15px] stroke-[1.7]" />
                            Awaiting Stripe Connection
                        </div>
                        <p className="text-[28px] md:text-[32px] leading-none text-amber-900" style={{ fontFamily: "var(--font-serif), serif" }}>
                            ${awaitingDollars.toFixed(2)}
                        </p>
                        <p className="mt-2 text-[13px] leading-[1.35] text-amber-900/80">
                            From {awaitingCount} sold {awaitingCount === 1 ? "item" : "items"}. Connect Stripe to claim.
                        </p>
                        <form action={handleConnectStripe} className="mt-3">
                            <button
                                type="submit"
                                className="inline-flex h-9 items-center justify-center rounded-full bg-amber-900 px-4 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2"
                            >
                                Connect Stripe
                            </button>
                        </form>
                    </div>
                )}
            </div>

            {/* RECENT ACTIVITY — the "real bank statement" section. Only
                rendered when the seller has any orders; empty state shows
                a friendly "no sales yet" message. */}
            <div className="rounded-[24px] border border-[#e3d9d1] bg-white p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-[20px] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 500 }}>
                        Sales &amp; Payouts
                    </h3>
                    {totalSalesCount > 10 ? (
                        <Link href="/dashboard/sales" className="text-[12px] font-medium text-[#8f6e59] hover:text-[#4a3328] transition">
                            View all sales →
                        </Link>
                    ) : null}
                </div>
                {recentOrders.length === 0 ? (
                    <p className="py-8 text-center text-[14px] text-[#8a7667]">
                        No sales yet. Your first order will show up here.
                    </p>
                ) : (
                    <ul className="divide-y divide-[#f2ebe4]">
                        {recentOrders.map((order) => {
                            const listing = order.purchase.listing;
                            const amount = (order.seller_transfer_amount_cents ?? 0) / 100;
                            const status = mapOrderToActivityStatus(order, now);
                            return (
                                <li key={order.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#e3d9d1] bg-[#f2ebe4]">
                                        {listing.image_url ? (
                                            <Image
                                                src={listing.image_url}
                                                alt={listing.title}
                                                fill
                                                className="object-cover"
                                                sizes="48px"
                                                unoptimized
                                            />
                                        ) : null}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-medium text-[#2f2925]">{listing.title}</p>
                                        <p className="mt-0.5 text-[12px] text-[#8a7667]">
                                            {formatShortDate(order.created_at)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[14px] font-semibold text-[#2f2925]">${amount.toFixed(2)}</p>
                                        <span className={`mt-1 inline-block rounded-full px-2.5 py-[3px] text-[11px] font-medium tracking-[0.01em] ${status.className}`}>
                                            {status.label}
                                        </span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="rounded-[24px] border border-[#e3d9d1] bg-white p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
                <h3 className="text-[20px] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 500 }}>Understanding your payouts</h3>
                <p className="text-[15px] text-[#8a7667] leading-[1.6]">
                    Modaire securely handles all seller payouts. Your earnings move through these stages:
                </p>
                <ol className="space-y-2 text-[14px] text-[#4a3d33] leading-[1.6] list-decimal pl-5 marker:text-[#8a7667]">
                    <li>
                        <span className="text-[#2f2925] font-medium">Pending Payouts</span> — after an item is delivered, funds sit in a short buyer-protection window, then move to your connected payout account.
                    </li>
                    <li>
                        <span className="text-[#2f2925] font-medium">Available Balance</span> — cleared and ready to be released to your bank on your chosen payout schedule.
                    </li>
                    <li>
                        <span className="text-[#2f2925] font-medium">Awaiting Setup</span> — if you haven&rsquo;t connected a payout account yet, sold-item funds wait here with no deadline to claim.
                    </li>
                </ol>
                {!user?.stripe_account_id && (
                    <p className="text-[13px] text-[#8a7667] leading-[1.6]">
                        Funds from completed sales are held on Modaire until you connect your payout account — there is no deadline to claim them.
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Grid Tailwind class based on how many balance cards are visible.
 * 2 = base state (Stripe Balance + Pending)
 * 3 = with Awaiting Stripe Connection card
 */
function gridColumnClass(count: number): string {
    if (count === 3) return "md:grid-cols-3";
    return "md:grid-cols-2";
}

/**
 * Pending Payouts tile subcopy. Prefers a specific estimated date
 * when we can compute one (from the earliest hold_until across the
 * seller's held orders). Otherwise softens to a reassuring statement
 * about the buyer-protection window.
 */
function buildPendingCopy(
    heldCount: number,
    heldDollars: number,
    stripePendingDollars: number,
    estimatedAvailability: Date | null,
): string {
    const totalDollars = heldDollars + stripePendingDollars;
    if (totalDollars === 0 && heldCount === 0) {
        return "No payouts in flight right now.";
    }
    if (estimatedAvailability) {
        const formatted = estimatedAvailability.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
        return `Estimated availability: ${formatted}`;
    }
    return "Available after buyer protection ends.";
}

/**
 * Small KPI tile for the top-of-page snapshot strip. Denser than the
 * balance tiles below (single-line label + single-line value).
 */
function KpiTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
    return (
        <div className="rounded-[22px] border border-[#e3d9d1] bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#8f6e59]">
                {icon}
                {label}
            </div>
            <p className="text-[20px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>
                {value}
            </p>
        </div>
    );
}

/**
 * Map an order's state to an activity-list status pill. Uses
 * customer-friendly labels ("Buyer Protection" instead of "IN HOLD",
 * "Pending Payout" instead of "PROCESSING") that don't leak internal
 * payment mechanics. Title case + softer weight for premium feel.
 */
function mapOrderToActivityStatus(
    order: {
        shipping_status: string;
        seller_transfer_status: string;
        delivered_at: Date | null;
        hold_until: Date | null;
    },
    now: Date,
): { label: string; className: string } {
    if (order.seller_transfer_status === "RELEASED") {
        return { label: "Paid", className: "bg-emerald-50 text-emerald-800" };
    }
    if (order.seller_transfer_status === "AWAITING_SELLER_STRIPE") {
        return { label: "Awaiting Setup", className: "bg-amber-50 text-amber-800" };
    }
    if (order.seller_transfer_status === "PENDING_HOLD" && order.delivered_at && order.hold_until && order.hold_until > now) {
        return { label: "Buyer Protection", className: "bg-[#efe6dd] text-[#7f5f4e]" };
    }
    if (order.shipping_status === "DELIVERED") {
        return { label: "Delivered", className: "bg-blue-50 text-blue-800" };
    }
    if (order.shipping_status === "SHIPPED") {
        return { label: "In Transit", className: "bg-sky-50 text-sky-800" };
    }
    if (order.shipping_status === "CANCELLED") {
        return { label: "Cancelled", className: "bg-red-50 text-red-800" };
    }
    if (order.shipping_status === "RETURNED") {
        return { label: "Returned", className: "bg-red-50 text-red-800" };
    }
    return { label: "Pending Payout", className: "bg-neutral-100 text-neutral-800" };
}

/**
 * Compact date for the activity list — "Jul 18" or "Jul 18, 2025" if the
 * year is different from today's.
 */
function formatShortDate(date: Date): string {
    const now = new Date();
    const opts: Intl.DateTimeFormatOptions = date.getFullYear() === now.getFullYear()
        ? { month: "short", day: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" };
    return date.toLocaleDateString("en-US", opts);
}
