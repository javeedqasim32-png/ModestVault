import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ArrowUpRight, ShieldCheck, ShoppingBag, Sparkles, Tag, Wallet } from "lucide-react";
import Link from "next/link";

export default async function ProfileDashboard() {
    const session = await auth();
    const userId = session?.user?.id;

    const dbUser = userId ? await prisma.user.findUnique({
        where: { id: userId },
        select: { seller_enabled: true }
    }) : null;

    const isSeller = dbUser?.seller_enabled || false;
    const [purchasesCount, activeListingsCount, salesCount] = userId
        ? await Promise.all([
            prisma.purchase.count({ where: { buyer_id: userId } }),
            prisma.listing.count({ where: { user_id: userId, status: "AVAILABLE" } }),
            prisma.purchase.count({ where: { listing: { user_id: userId } } }),
        ])
        : [0, 0, 0];

    const cards = [
        { label: "Orders", value: "Track purchases", icon: ShoppingBag, href: "/dashboard/purchases" },
        { label: "Sell", value: isSeller ? "Create listing" : "Become a seller", icon: Tag, href: "/sell" },
        { label: "Sales", value: "Manage sold items", icon: ArrowUpRight, href: "/dashboard/sales" },
        { label: "Earnings", value: "Payout overview", icon: Wallet, href: "/dashboard/earnings" },
    ];

    return (
        <div className="space-y-8">
            <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-[linear-gradient(135deg,#f3e7de_0%,#eeded3_55%,#e7d2c4_100%)] p-8 md:p-10">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Personal hub
                    </div>
                    <h1 className="mt-5 font-serif text-4xl leading-tight text-foreground md:text-5xl">
                        Welcome back, {session?.user?.name?.split(" ")[0] ?? "there"}.
                    </h1>
                    <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                        View your orders, track active listings, and manage your sales performance in one place. Use this page to quickly jump into selling, payouts, and account activity.
                    </p>

                    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {cards.map((card) => {
                            const Icon = card.icon;
                            return (
                                <Link
                                    key={card.label}
                                    href={card.href}
                                    className="rounded-[1.35rem] border border-border/80 bg-card/80 p-5 hover:bg-background"
                                >
                                    <Icon className="h-5 w-5 text-primary" />
                                    <p className="mt-4 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{card.label}</p>
                                    <p className="mt-2 text-lg text-foreground">{card.value}</p>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,#faf5f1_0%,#f1e7e0_100%)] p-8">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Account snapshot</p>
                    <div className="mt-6 space-y-5">
                        <div className="rounded-[1.25rem] border border-border/80 bg-card p-5">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Name</p>
                            <p className="mt-2 text-xl text-foreground">{session?.user?.name}</p>
                        </div>
                        <div className="rounded-[1.25rem] border border-border/80 bg-card p-5">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Email</p>
                            <p className="mt-2 flex items-center gap-2 text-base text-foreground">
                                {session?.user?.email}
                                <ShieldCheck className="h-4 w-4 text-green-600" />
                            </p>
                        </div>
                        <div className={`rounded-[1.25rem] border p-5 ${isSeller ? "border-[#bfd6c1] bg-[#edf7ee]" : "border-border/80 bg-card"}`}>
                            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Seller status</p>
                            <p className="mt-2 text-xl text-foreground">{isSeller ? "Active seller" : "Not enabled yet"}</p>
                            <Link href="/sell" className="mt-4 inline-flex items-center gap-2 text-sm text-primary">
                                {isSeller ? "Create a new listing" : "Finish seller onboarding"}
                                <ArrowUpRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-1">
                <div className="rounded-[1.75rem] border border-border/80 bg-card p-8">
                    <div className="flex items-center justify-between">
                        <h2 className="font-serif text-3xl text-foreground">Marketplace Activity</h2>
                    </div>
                    <div className="mt-8 grid gap-4 md:grid-cols-3">
                        {[
                            ["Purchases", String(purchasesCount), "/dashboard/purchases"],
                            ["Active listings", String(activeListingsCount), "/sell"],
                            ["Sales", String(salesCount), "/dashboard/sales"],
                        ].map(([label, value, href]) => (
                            <Link key={label} href={href} className="rounded-[1.35rem] border border-border/80 bg-[linear-gradient(180deg,#fbf7f4_0%,#f4ece5_100%)] p-6 hover:bg-background">
                                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
                                <p className="mt-3 font-serif text-5xl text-foreground">{value}</p>
                            </Link>
                        ))}
                    </div>
                </div>

            </section>
        </div>
    );
}
