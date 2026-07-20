import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripeBalance, createStripeDashboardLink, onboardSellerAction } from "@/app/actions/stripe";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import {
    Clock,
    TrendingUp,
    AlertCircle,
    Calendar,
    Wallet,
    CheckCircle2,
    Settings,
    ChevronRight,
    ArrowUp,
    ArrowDown,
    Package,
} from "lucide-react";

// Same Cormorant Garamond used for "Trending Now" / "Featured" section
// headings on the home page. Kept in sync intentionally so seller-facing
// section headings share the marketplace's editorial voice.
const cormorantHeading = localFont({
    src: [
        { path: "../../../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
        { path: "../../../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
    ],
    display: "swap",
});

export const dynamic = "force-dynamic";

// Buyer-protection hold window (in days) applied after delivery before
// funds transfer to Stripe. Used to drive both the aggregate progress
// bar on the Pending Balance hero card and per-order progress bars in
// the Upcoming Releases list.
const HOLD_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type ListingLite = { id: string; title: string; image_url: string };
type OrderWithListing = {
    id: string;
    created_at: Date;
    delivered_at: Date | null;
    shipping_status: string;
    seller_transfer_status: string;
    seller_transfer_amount_cents: number | null;
    hold_until: Date | null;
    purchase: { amount: unknown; listing: ListingLite };
};

type OrderDelegate = {
    aggregate: (args: unknown) => Promise<{
        _sum: { seller_transfer_amount_cents: number | null };
        _count: number;
    }>;
    count: (args: unknown) => Promise<number>;
    findMany: (args: unknown) => Promise<OrderWithListing[]>;
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

    const orderDelegate = (prisma as unknown as { order: OrderDelegate }).order;

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const sellerScope = { purchase: { listing: { user_id: session.user.id } } };
    const releasedScope = { ...sellerScope, seller_transfer_status: "RELEASED" };

    // Money sold on Modaire but blocked from Stripe transfer because the
    // seller hasn't connected a payout account yet. Surface as its own
    // amber alert so the seller knows to act on it.
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

    // Every order still in the seller's payout pipeline: purchased but
    // not yet released to Stripe. Covers the full lifecycle —
    //   1. Sold, awaiting shipment  (delivered_at null, no label yet)
    //   2. Shipped, in transit      (delivered_at null, shipping_status SHIPPED)
    //   3. Delivered, in buyer-protection hold  (delivered_at set, hold_until > now)
    //   4. Hold expired, awaiting cron transfer (delivered_at set, hold_until <= now)
    // All four states pay the seller eventually, so all four roll into
    // Pending Balance + appear in Upcoming Releases. Cancelled/returned
    // orders excluded — the buyer's already been refunded.
    const pipelineWhere = {
        seller_transfer_status: "PENDING_HOLD",
        shipping_status: { notIn: ["CANCELLED", "RETURNED"] },
        purchase: { listing: { user_id: session.user.id } },
    };

    const [
        pipelineAggregate,
        lifetimeAgg,
        thisMonthAgg,
        lastMonthAgg,
        totalSalesCount,
        soldThisMonth,
        upcomingReleases,
    ] = await Promise.all([
        orderDelegate.aggregate({
            where: pipelineWhere,
            _sum: { seller_transfer_amount_cents: true },
            _count: true,
        }),
        // Lifetime + This Month + Last Month all count RELEASED-only —
        // that's what "earned" means to a seller (money in hand, not
        // money still in the payout pipeline). Held/pending/awaiting
        // funds get their own dedicated tiles below.
        orderDelegate.aggregate({ where: releasedScope, _sum: { seller_transfer_amount_cents: true } }),
        orderDelegate.aggregate({
            where: { ...releasedScope, seller_transfer_released_at: { gte: startOfThisMonth } },
            _sum: { seller_transfer_amount_cents: true },
        }),
        orderDelegate.aggregate({
            where: { ...releasedScope, seller_transfer_released_at: { gte: startOfLastMonth, lt: startOfThisMonth } },
            _sum: { seller_transfer_amount_cents: true },
        }),
        orderDelegate.count({ where: sellerScope }),
        // Items sold this month — feeds the left activity column.
        orderDelegate.findMany({
            where: { ...sellerScope, created_at: { gte: startOfThisMonth } },
            orderBy: { created_at: "desc" },
            take: 3,
            include: {
                purchase: {
                    select: {
                        amount: true,
                        listing: { select: { id: true, title: true, image_url: true } },
                    },
                },
            },
        }),
        // Upcoming releases — everything still in the payout pipeline.
        // Sort: delivered items first (soonest hold_until first, which
        // Postgres puts null-last on asc), then undelivered items newest
        // first so the seller sees their most recent sales after the
        // imminent-release stack.
        orderDelegate.findMany({
            where: pipelineWhere,
            orderBy: [{ hold_until: "asc" }, { created_at: "desc" }],
            take: 3,
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

    const pipelineCents = pipelineAggregate._sum.seller_transfer_amount_cents ?? 0;
    const pipelineCount = pipelineAggregate._count ?? 0;
    const pipelineDollars = pipelineCents / 100;
    const lifetimeDollars = (lifetimeAgg._sum.seller_transfer_amount_cents ?? 0) / 100;
    const thisMonthDollars = (thisMonthAgg._sum.seller_transfer_amount_cents ?? 0) / 100;
    const lastMonthDollars = (lastMonthAgg._sum.seller_transfer_amount_cents ?? 0) / 100;
    // Pending Balance = everything the seller will eventually be paid
    // for but hasn't received yet. Pipeline (pre-Stripe transfer) +
    // Stripe pending (already transferred, awaiting bank release).
    // These are disjoint by construction — an order can't be both
    // PENDING_HOLD and already in Stripe's balance.
    const pendingTotalDollars = pipelineDollars + balance.pending;

    // Month-over-month delta on the "This Month" KPI. Only show when we
    // have a positive baseline to compare against — otherwise the
    // percentage is meaningless (dividing by zero or spiking to
    // "+∞%" the first month a seller has any activity).
    const monthDeltaPercent = lastMonthDollars > 0
        ? Math.round(((thisMonthDollars - lastMonthDollars) / lastMonthDollars) * 100)
        : null;

    // The aggregate progress bar + "Expected payout" date on the
    // Pending Balance hero card only make sense for delivered orders
    // (undelivered ones have no hold_until yet). Pick the first
    // upcoming release that's actually in the buyer-protection window
    // — skip past shipped/unshipped items at the top of the list.
    const nextRelease = upcomingReleases.find(o => o.delivered_at && o.hold_until) ?? null;
    const pendingProgress = nextRelease
        ? computeHoldProgress(nextRelease.delivered_at, nextRelease.hold_until, now)
        : null;

    // Pre-fetch the Stripe Express hosted dashboard link so the header
    // "Payout Settings" button reliably opens in a new tab. Skip for
    // sellers who haven't connected Stripe — there's no dashboard yet.
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
        <div className="px-6 py-8 sm:px-10 lg:px-12 space-y-8" style={{ fontFamily: "var(--font-sans), sans-serif" }}>
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className={`${cormorantHeading.className} -ml-[3px] text-[32px] md:text-[38px] font-medium leading-[1.05] text-[#2f2925]`}>
                        Financial Overview
                    </h1>
                    <p className="mt-2 text-[15px] text-[#8a7667]">Track your earnings, payouts and withdrawals.</p>
                </div>

                <a
                    href={stripeDashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open payout settings"
                    className="inline-flex h-10 items-center justify-center rounded-full border border-[#d9cfc7] bg-white px-4 py-2 text-sm font-medium text-[#4a3328] transition hover:bg-[#ede7df] shadow-sm"
                >
                    <Settings className="w-4 h-4 mr-2" />
                    Payout Settings
                </a>
            </div>

            {/* HERO CARDS — Available Balance + Pending Balance side-by-side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Available Balance */}
                <div className="rounded-[24px] border border-[#e3d9d1] bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e5eadd]">
                            <Wallet className="h-[22px] w-[22px] stroke-[1.7] text-[#5d6d3f]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#5d6d3f]/80">
                                Available Balance
                            </p>
                            <p className="mt-1 text-[32px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>
                                ${balance.available.toFixed(2)}
                            </p>
                            {user?.stripe_account_id ? (
                                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#5d6d3f]">
                                    <CheckCircle2 className="h-[14px] w-[14px] stroke-[2]" />
                                    Auto-payout to your bank
                                </p>
                            ) : (
                                <p className="mt-2 text-[13px] text-[#8a7667]">
                                    Connect a payout account to start receiving earnings
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Next-payout pill — click-through opens the Stripe
                        Express hosted dashboard where the seller can see
                        the exact next payout date, edit their bank details,
                        or trigger a manual payout. */}
                    <div className="mt-5">
                        {user?.stripe_account_id ? (
                            <a
                                href={stripeDashboardUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Manage payout schedule and bank details on Stripe"
                                className="group flex items-center justify-center gap-2 rounded-full bg-[#5d6d3f] px-5 py-3 text-white shadow-sm transition hover:bg-[#4a5732] focus:outline-none focus:ring-2 focus:ring-[#5d6d3f]/40 focus:ring-offset-2"
                            >
                                <span className="text-[13px] font-medium tracking-[0.02em]">Manage Payout</span>
                                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                            </a>
                        ) : (
                            <form action={handleConnectStripe}>
                                <button
                                    type="submit"
                                    className="w-full rounded-full bg-[#f4efea] px-5 py-3 text-center text-[13px] text-[#8a7667] transition hover:bg-[#ede4d9]"
                                >
                                    Connect a payout account to start receiving withdrawals
                                </button>
                            </form>
                        )}
                    </div>
                </div>

                {/* Pending Balance */}
                <div className="rounded-[24px] border border-[#e3d9d1] bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#efe6dd]">
                            <Clock className="h-[22px] w-[22px] stroke-[1.7] text-[#8f6e59]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8f6e59]">
                                Pending Balance
                            </p>
                            <p className="mt-1 text-[32px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>
                                ${pendingTotalDollars.toFixed(2)}
                            </p>
                        </div>
                    </div>

                    {pendingProgress ? (
                        <>
                            <div className="mt-5 flex items-center justify-between text-[13px]">
                                <span className="font-medium text-[#4a3d33]">Buyer Protection</span>
                                <span className="text-[#8a7667]">{pendingProgress.daysElapsed} of {HOLD_DAYS} days</span>
                            </div>
                            <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-[#f2ebe4]">
                                <div
                                    className="h-full rounded-full bg-[#c88554] transition-all"
                                    style={{ width: `${pendingProgress.percent}%` }}
                                />
                            </div>
                            <div className="mt-4 flex items-center gap-2.5 border-t border-[#f2ebe4] pt-4">
                                <Calendar className="h-4 w-4 stroke-[1.8] text-[#8f6e59]" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] uppercase tracking-[0.14em] text-[#8a7667]">Expected payout</span>
                                    <span className="text-[14px] font-medium text-[#2f2925]">
                                        {formatFullDate(nextRelease?.hold_until ?? null)}
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="mt-5 text-[13px] leading-[1.5] text-[#8a7667]">
                            {pendingTotalDollars > 0
                                ? "Payouts release after delivery and a 3-day buyer-protection window."
                                : "No payouts in flight right now."}
                        </p>
                    )}
                </div>
            </div>

            {/* AWAITING STRIPE (conditional full-width alert) */}
            {awaitingCount > 0 && (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                                <AlertCircle className="h-5 w-5 stroke-[1.8] text-amber-800" />
                            </div>
                            <div>
                                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
                                    Awaiting Stripe Connection
                                </p>
                                <p className="mt-1 text-[22px] leading-none text-amber-900" style={{ fontFamily: "var(--font-serif), serif" }}>
                                    ${awaitingDollars.toFixed(2)}
                                </p>
                                <p className="mt-2 text-[13px] text-amber-900/80">
                                    From {awaitingCount} sold {awaitingCount === 1 ? "item" : "items"}. Connect Stripe to claim.
                                </p>
                            </div>
                        </div>
                        <form action={handleConnectStripe}>
                            <button
                                type="submit"
                                className="inline-flex h-10 items-center justify-center rounded-full bg-amber-900 px-5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2"
                            >
                                Connect Stripe
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* KPI STRIP */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiTile
                    label="Lifetime Earnings"
                    value={`$${formatShortMoney(lifetimeDollars)}`}
                    sub="All time"
                    icon={<TrendingUp className="h-[13px] w-[13px] stroke-[1.8]" />}
                    iconBg="bg-[#e5eadd] text-[#5d6d3f]"
                />
                <KpiTile
                    label="This Month"
                    value={`$${formatShortMoney(thisMonthDollars)}`}
                    sub={buildMonthDeltaSub(monthDeltaPercent)}
                    subTone={monthDeltaPercent === null ? "muted" : monthDeltaPercent >= 0 ? "positive" : "negative"}
                    icon={<Calendar className="h-[13px] w-[13px] stroke-[1.8]" />}
                    iconBg="bg-[#efe6dd] text-[#8f6e59]"
                />
                <KpiTile
                    label="Available for Withdrawal"
                    value={`$${formatShortMoney(balance.available)}`}
                    sub="Ready now"
                    subTone="positive"
                    icon={<Wallet className="h-[13px] w-[13px] stroke-[1.8]" />}
                    iconBg="bg-[#e5eadd] text-[#5d6d3f]"
                />
                <KpiTile
                    label="Pending"
                    value={`$${formatShortMoney(pendingTotalDollars)}`}
                    sub={pendingTotalDollars > 0 ? "On the way" : `${totalSalesCount} lifetime ${totalSalesCount === 1 ? "sale" : "sales"}`}
                    icon={<Clock className="h-[13px] w-[13px] stroke-[1.8]" />}
                    iconBg="bg-[#efe6dd] text-[#8f6e59]"
                />
            </div>

            {/* TWO-COLUMN — Sold This Month + Upcoming Releases */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Sold This Month */}
                <div className="rounded-[24px] border border-[#e3d9d1] bg-white p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-[#2f2925]`}>
                            Sold This Month
                        </h3>
                        <Link
                            href="/dashboard/sales"
                            className="inline-flex items-center gap-0.5 text-[12px] font-medium text-[#8f6e59] hover:text-[#4a3328] transition"
                        >
                            View all <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                    {soldThisMonth.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f4efea]">
                                <Package className="h-5 w-5 stroke-[1.6] text-[#8a7667]" />
                            </div>
                            <p className="text-[13px] text-[#8a7667]">No sales this month yet.</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-[#f2ebe4]">
                            {soldThisMonth.map((order) => {
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

                {/* Upcoming Releases */}
                <div className="rounded-[24px] border border-[#e3d9d1] bg-white p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-[#2f2925]`}>
                            Upcoming Releases
                        </h3>
                        {pipelineCount > upcomingReleases.length ? (
                            <Link
                                href="/dashboard/sales"
                                className="inline-flex items-center gap-0.5 text-[12px] font-medium text-[#8f6e59] hover:text-[#4a3328] transition"
                            >
                                View all <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                        ) : null}
                    </div>
                    {upcomingReleases.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f4efea]">
                                <Clock className="h-5 w-5 stroke-[1.6] text-[#8a7667]" />
                            </div>
                            <p className="text-[13px] text-[#8a7667]">No payouts in flight right now.</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-[#f2ebe4]">
                            {upcomingReleases.map((order) => {
                                const listing = order.purchase.listing;
                                const amount = (order.seller_transfer_amount_cents ?? 0) / 100;
                                const progress = computeHoldProgress(order.delivered_at, order.hold_until, now);
                                // Two states in this list: post-delivery (Buyer
                                // Protection countdown, progress bar) OR pre-
                                // delivery (Awaiting Delivery, no bar — we don't
                                // know when the carrier will deliver).
                                const stageLabel = order.delivered_at ? "Buyer Protection" : "Awaiting Delivery";
                                return (
                                    <li key={order.id}>
                                        <Link
                                            href={`/listings/${listing.id}`}
                                            className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 transition hover:bg-[#f7f2ed] focus:outline-none focus:ring-2 focus:ring-[#c88554]/30"
                                            aria-label={`View listing: ${listing.title}`}
                                        >
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
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="truncate text-[14px] font-medium text-[#2f2925]">{listing.title}</p>
                                                    <p className="text-[14px] font-semibold text-[#2f2925] whitespace-nowrap">${amount.toFixed(2)}</p>
                                                </div>
                                                <p className="mt-0.5 text-[12px] text-[#8f6e59]">{stageLabel}</p>
                                                {progress ? (
                                                    <div className="mt-2">
                                                        <div className="h-[5px] overflow-hidden rounded-full bg-[#f2ebe4]">
                                                            <div
                                                                className="h-full rounded-full bg-[#c88554]"
                                                                style={{ width: `${progress.percent}%` }}
                                                            />
                                                        </div>
                                                        <p className="mt-1 text-[11px] text-[#8a7667]">
                                                            {progress.daysElapsed} of {HOLD_DAYS} days
                                                        </p>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {/* Understanding your payouts — kept as the tail explainer */}
            <div className="rounded-[24px] border border-[#e3d9d1] bg-white p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
                <h3 className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-[#2f2925]`}>Understanding your payouts</h3>
                <p className="text-[15px] text-[#8a7667] leading-[1.6]">
                    Modaire securely handles all seller payouts. Your earnings move through these stages:
                </p>
                <ol className="space-y-2 text-[14px] text-[#4a3d33] leading-[1.6] list-decimal pl-5 marker:text-[#8a7667]">
                    <li>
                        <span className="text-[#2f2925] font-medium">Pending Balance</span> — after an item is delivered, funds sit in a 3-day buyer-protection window, then move to your connected payout account.
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
 * Progress through the 3-day buyer-protection hold for a single held
 * order. Returns null when we can't compute (missing delivered_at /
 * hold_until — should only happen for non-held orders passed in
 * defensively).
 */
function computeHoldProgress(
    deliveredAt: Date | null,
    holdUntil: Date | null,
    now: Date,
): { daysElapsed: number; percent: number } | null {
    if (!deliveredAt || !holdUntil) return null;
    const elapsedMs = now.getTime() - deliveredAt.getTime();
    const totalMs = holdUntil.getTime() - deliveredAt.getTime();
    if (totalMs <= 0) return null;
    const percent = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
    const daysElapsed = Math.min(HOLD_DAYS, Math.max(0, Math.floor(elapsedMs / DAY_MS)));
    return { daysElapsed, percent };
}

/**
 * "$8,425.00" → "8,425" for compact KPI display. Keeps the leading $
 * out (the caller adds it) so we can shorten large numbers without
 * fighting locale formatting.
 */
function formatShortMoney(value: number): string {
    // For whole-dollar amounts >= $1,000 we drop the cents to keep KPI
    // tiles from wrapping. Small amounts show full cents so a $12.50 sale
    // doesn't display as "$12".
    if (value >= 1000 && value % 1 === 0) {
        return value.toLocaleString("en-US");
    }
    if (value >= 1000) {
        return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return value.toFixed(2);
}

/**
 * Compose the "vs last month" subtitle for the This Month KPI. Null
 * baseline (no prior activity) collapses to a soft placeholder so we
 * don't render "↑ ∞%" or "↑ 100%" for a first-month seller.
 */
function buildMonthDeltaSub(deltaPercent: number | null): string {
    if (deltaPercent === null) return "vs last month: —";
    if (deltaPercent === 0) return "0% vs last month";
    const arrow = deltaPercent >= 0 ? "↑" : "↓";
    return `${arrow} ${Math.abs(deltaPercent)}% vs last month`;
}

/**
 * Small KPI tile for the top-of-page snapshot strip. Includes a colored
 * icon chip on the left + tone-aware subtitle (positive → green, negative
 * → warm terracotta, muted → grey).
 */
function KpiTile({
    label,
    value,
    sub,
    subTone = "muted",
    icon,
    iconBg,
}: {
    label: string;
    value: string;
    sub: string;
    subTone?: "positive" | "negative" | "muted";
    icon: React.ReactNode;
    iconBg: string;
}) {
    const subColor = subTone === "positive"
        ? "text-[#5d6d3f]"
        : subTone === "negative"
            ? "text-[#c88554]"
            : "text-[#8a7667]";
    return (
        <div className="rounded-[22px] border border-[#e3d9d1] bg-white px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
            <div className="flex items-center gap-2">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${iconBg}`}>
                    {icon}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8f6e59]">
                    {label}
                </span>
            </div>
            <p className="mt-2 text-[22px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>
                {value}
            </p>
            <p className={`mt-1.5 text-[11px] leading-[1.3] ${subColor} flex items-center gap-1`}>
                {subTone === "positive" && sub.startsWith("↑") ? (
                    <ArrowUp className="h-3 w-3 stroke-[2.2]" />
                ) : null}
                {subTone === "negative" && sub.startsWith("↓") ? (
                    <ArrowDown className="h-3 w-3 stroke-[2.2]" />
                ) : null}
                <span>{sub.replace(/^[↑↓]\s*/, "")}</span>
            </p>
        </div>
    );
}

/**
 * Map an order's state to an activity-list status pill. Uses
 * customer-friendly labels that don't leak internal payment mechanics.
 * Title case + softer weight for a premium feel.
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

/** "Jul 18" or "Jul 18, 2025" if the year differs from today's. */
function formatShortDate(date: Date): string {
    const now = new Date();
    const opts: Intl.DateTimeFormatOptions = date.getFullYear() === now.getFullYear()
        ? { month: "short", day: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" };
    return date.toLocaleDateString("en-US", opts);
}

/** "Tuesday, July 22" — used for the Expected payout row on the hero card. */
function formatFullDate(date: Date | null): string {
    if (!date) return "—";
    return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}
