import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripeBalance, createStripeDashboardLink } from "@/app/actions/stripe";
import { redirect } from "next/navigation";
import { Wallet, Clock, ExternalLink, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function EarningsPage() {
    const session = await auth();
    if (!session?.user?.id) redirect("/login");

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { stripe_account_id: true, seller_enabled: true }
    });

    if (!user?.seller_enabled) {
        return (
            <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border text-center px-6">
                <Wallet className="w-12 h-12 text-muted-foreground/30 mb-6" />
                <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">Earnings Inactive</h2>
                <p className="text-muted-foreground max-w-sm mx-auto mb-8">
                    Complete your seller onboarding to start receiving payouts.
                </p>
                <Link href="/sell">
                    <Button>Setup Seller Account</Button>
                </Link>
            </div>
        );
    }

    const balance = user.stripe_account_id
        ? await getStripeBalance(user.stripe_account_id)
        : { available: 0, pending: 0, currency: "USD" };

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                        Financial Overview
                    </h1>
                    <p className="text-muted-foreground">Track your marketplace success and payouts.</p>
                </div>

                <form action={async () => {
                    "use server";
                    const { url } = await createStripeDashboardLink();
                    redirect(url);
                }}>
                    <Button type="submit" variant="outline">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Stripe Dashboard
                    </Button>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Available Balance */}
                <div className="bg-primary text-primary-foreground p-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 opacity-60" />
                            <span className="text-[11px] font-semibold uppercase tracking-widest opacity-60">Available Balance</span>
                        </div>
                        <h2 className="font-serif text-5xl font-bold">
                            ${balance.available.toFixed(2)}
                        </h2>
                        <p className="text-primary-foreground/60 text-sm">
                            Secured and ready for bank transfer.
                        </p>
                    </div>
                </div>

                {/* Pending Balance */}
                <div className="border border-border p-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-muted-foreground" />
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Pending</span>
                        </div>
                        <h2 className="font-serif text-5xl font-bold text-foreground">
                            ${balance.pending.toFixed(2)}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Funds in transit from completed sales.
                        </p>
                    </div>
                </div>
            </div>

            <div className="border border-border p-8 space-y-3">
                <h3 className="font-serif text-lg font-semibold text-foreground">Understanding your payouts</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    ModestVault partners with <span className="text-foreground font-medium">Stripe Express</span> for secure, automated payments.
                    Funds typically transition from <em>Pending</em> to <em>Available</em> within 2–7 business days.
                    Once available, they are dispatched directly to your connected bank account.
                </p>
            </div>
        </div>
    );
}
