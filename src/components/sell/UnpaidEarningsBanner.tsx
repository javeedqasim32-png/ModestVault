import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCachedSession } from "@/lib/session";
import { onboardSellerAction } from "@/app/actions/stripe";
import { redirect } from "next/navigation";

type OrderAggregateDelegate = {
    aggregate: (args: unknown) => Promise<{
        _sum: { seller_transfer_amount_cents: number | null };
        _count: number;
    }>;
};

// 5-minute cache per seller — pending earnings only change when an Order
// delivers and the payout cron runs, so a brief staleness is invisible to
// users and turns "DB hit on every page load" into "once per 5 min per
// seller." Keyed by userId so different sellers don't share results.
async function getUnpaidEarningsUncached(userId: string) {
    const orderDelegate = (prisma as unknown as { order: OrderAggregateDelegate }).order;
    const result = await orderDelegate.aggregate({
        where: {
            seller_transfer_status: "AWAITING_SELLER_STRIPE",
            seller_transfer_id: null,
            purchase: { listing: { user_id: userId } },
        },
        _sum: { seller_transfer_amount_cents: true },
        _count: true,
    });
    return {
        totalCents: result._sum.seller_transfer_amount_cents ?? 0,
        count: result._count ?? 0,
    };
}

const getUnpaidEarnings = (userId: string) =>
    unstable_cache(
        () => getUnpaidEarningsUncached(userId),
        ["unpaid-earnings", userId],
        { revalidate: 300, tags: [`unpaid-earnings:${userId}`] }
    )();

async function handleConnectStripe() {
    "use server";
    const result = await onboardSellerAction();
    if (result?.url) redirect(result.url);
}

export default async function UnpaidEarningsBanner() {
    const session = await getCachedSession();
    if (!session?.user?.id) return null;

    // Skip the earnings query entirely for non-sellers. session.user.sellerEnabled
    // comes from the JWT (auth.ts) so this check costs zero queries.
    const sellerEnabled = (session.user as { sellerEnabled?: boolean }).sellerEnabled;
    if (!sellerEnabled) return null;

    const { totalCents, count } = await getUnpaidEarnings(session.user.id);
    if (count === 0 || totalCents <= 0) return null;

    const totalDollars = (totalCents / 100).toFixed(2);
    const itemLabel = count === 1 ? "item" : "items";

    return (
        <div className="w-full border-b border-amber-200 bg-amber-50">
            <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <div className="flex-1 text-sm text-amber-900">
                    <span className="font-medium">
                        ${totalDollars} waiting
                    </span>
                    <span className="ml-1">
                        from {count} sold {itemLabel}. Connect Stripe to receive your payout.
                    </span>
                </div>
                <form action={handleConnectStripe}>
                    <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-md bg-amber-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2"
                    >
                        Connect Stripe
                    </button>
                </form>
            </div>
        </div>
    );
}
