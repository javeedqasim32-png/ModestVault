import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripeBalance, createStripeDashboardLink, onboardSellerAction } from "@/app/actions/stripe";
import { redirect } from "next/navigation";
import { Clock, ExternalLink, TrendingUp, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

type OrderAggregateDelegate = {
    aggregate: (args: unknown) => Promise<{
        _sum: { seller_transfer_amount_cents: number | null };
        _count: number;
    }>;
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

                <a href={stripeDashboardUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center rounded-full border border-[#d9cfc7] bg-white px-4 py-2 text-sm font-medium text-[#4a3328] transition hover:bg-[#ede7df] shadow-sm">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Stripe Dashboard
                </a>
            </div>

            <div className={`grid grid-cols-1 gap-6 ${awaitingCount > 0 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {/* Available Balance */}
                <a href={stripeDashboardUrl} target="_blank" rel="noopener noreferrer" className="block w-full text-left rounded-[24px] bg-[linear-gradient(135deg,#b89881_0%,#7f5f4e_100%)] p-6 sm:p-8 text-white shadow-[0_12px_30px_rgba(111,81,67,0.18)] relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_14px_36px_rgba(111,81,67,0.25)]">
                    <div className="space-y-6 relative z-10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <TrendingUp className="w-4 h-4 text-white/80" />
                                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/80">Available Balance</span>
                            </div>
                            <ExternalLink className="w-4 h-4 text-white/60" />
                        </div>
                        <h2 className="text-[44px] md:text-[54px] leading-none text-white" style={{ fontFamily: "var(--font-serif), serif" }}>
                            ${balance.available.toFixed(2)}
                        </h2>
                        <p className="text-[14px] text-white/80 leading-relaxed">
                            Secured and ready for bank transfer. Click to view dashboard.
                        </p>
                    </div>
                </a>

                {/* Pending Balance */}
                <div className="rounded-[24px] border border-[#d9cfc7] bg-[#f7f2ed] p-6 sm:p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                    <div className="space-y-6">
                        <div className="flex items-center gap-2.5">
                            <Clock className="w-4 h-4 text-[#8f6e59]" />
                            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8f6e59]">Pending</span>
                        </div>
                        <h2 className="text-[44px] md:text-[54px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>
                            ${balance.pending.toFixed(2)}
                        </h2>
                        <p className="text-[14px] text-[#8a7667] leading-relaxed">
                            Funds in transit from completed sales.
                        </p>
                    </div>
                </div>

                {awaitingCount > 0 && (
                    <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-6 sm:p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]">
                        <div className="space-y-6">
                            <div className="flex items-center gap-2.5">
                                <AlertCircle className="w-4 h-4 text-amber-700" />
                                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700">Awaiting Stripe Connection</span>
                            </div>
                            <h2 className="text-[44px] md:text-[54px] leading-none text-amber-900" style={{ fontFamily: "var(--font-serif), serif" }}>
                                ${awaitingDollars.toFixed(2)}
                            </h2>
                            <p className="text-[14px] text-amber-900/80 leading-relaxed">
                                From {awaitingCount} sold {awaitingCount === 1 ? "item" : "items"}. Connect Stripe to claim your payout.
                            </p>
                            <form action={handleConnectStripe}>
                                <button
                                    type="submit"
                                    className="inline-flex items-center justify-center rounded-full bg-amber-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2"
                                >
                                    Connect Stripe to claim
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            <div className="rounded-[24px] border border-[#e3d9d1] bg-white p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
                <h3 className="text-[20px] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 500 }}>Understanding your payouts</h3>
                <p className="text-[15px] text-[#8a7667] leading-[1.6]">
                    Modaire partners with <span className="text-[#2f2925] font-medium">Stripe Express</span> for secure, automated payments.
                    Funds typically transition from <em>Pending</em> to <em>Available</em> within 2–7 business days.
                    Once available, they are dispatched directly to your connected bank account.
                </p>
                {!user?.stripe_account_id && (
                    <p className="text-[13px] text-[#8a7667] leading-[1.6]">
                        Funds from completed sales are held on Modaire until you connect Stripe — there is no deadline to claim them.
                    </p>
                )}
            </div>
        </div>
    );
}
