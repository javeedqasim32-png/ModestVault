import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChevronRight, CircleHelp, FileText, PencilLine, ShieldCheck, ShoppingBag, Tag, Trash2, TrendingUp, UserRound, Wallet } from "lucide-react";
import Link from "next/link";

export default async function ProfileDashboard() {
    const session = await auth();
    const userId = session?.user?.id;

    const dbUser = userId ? await prisma.user.findUnique({
        where: { id: userId },
        select: { seller_enabled: true }
    }) : null;

    const isSeller = dbUser?.seller_enabled || false;
    const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin;
    const favoriteDelegate = (prisma as unknown as {
        favoriteItem?: {
            count: (args: unknown) => Promise<number>;
        };
    }).favoriteItem;
    const favoriteCount = userId && favoriteDelegate
        ? await favoriteDelegate.count({ where: { user_id: userId } }).catch(() => 0)
        : 0;

    const cards = [
        ...(isAdmin ? [{ label: "Admin", value: "Manage marketplace", icon: ShieldCheck, href: "/admin/listings" }] : []),
        { label: "Orders", value: "Track purchases", icon: ShoppingBag, href: "/dashboard/purchases" },
        { label: "Sell", value: isSeller ? "Create listing" : "Become a seller", icon: Tag, href: "/sell" },
        { label: "Sales", value: "Sold items", icon: TrendingUp, href: "/dashboard/sales" },
        { label: "Earnings", value: "Payout overview", icon: Wallet, href: "/dashboard/earnings" },
    ];

    return (
        <div className="flex-1 overflow-y-auto bg-[#f4efea] pb-[96px] lg:pb-6" style={{ fontFamily: "var(--font-sans), sans-serif" }}>
            <div className="mx-auto w-full max-w-[860px] overflow-hidden border-y border-[#ddd3cb] bg-[#f4efea]">
                <section className="border-b border-[#ddd3cb] px-6 py-6 text-center sm:px-8 sm:py-8">
                    <div className="mx-auto flex h-[96px] w-[96px] items-center justify-center rounded-full border-[4px] border-[#e1d6cd] bg-[linear-gradient(135deg,#d5c1b1_0%,#c8ad9c_100%)] text-[36px] text-[#7a6050]" style={{ fontFamily: "var(--font-serif), serif" }}>
                        {(session?.user?.name?.split(" ").map((part) => part[0]).join("").slice(0, 2) || "TU").toUpperCase()}
                    </div>
                    <h1 className="mt-4 text-[38px] leading-[1] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif" }}>{session?.user?.name ?? "Test User"}</h1>
                    <p className="mt-2 text-[14px] text-[#8a7667]">{session?.user?.email}</p>
                    <Link
                        href="/dashboard/settings"
                        className="mt-6 inline-flex h-12 items-center gap-2 rounded-full border border-[#d7cac0] bg-[#f4efea] px-7 text-[14px] font-normal text-[#2f2925] transition hover:bg-[#ede7df]"
                    >
                        <PencilLine className="h-4 w-4" />
                        Edit Profile
                    </Link>
                </section>

                <section className="border-b border-[#e8dfd8] px-6 py-7 sm:px-8">
                    <div className="grid grid-cols-2 gap-4">
                        {cards.map((card) => {
                            const Icon = card.icon;
                            return (
                                <Link
                                    key={card.label}
                                    href={card.href}
                                    className="rounded-[30px] border border-[#e3d9d1] bg-[#f7f2ed] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition hover:bg-[#f2ebe4]"
                                >
                                    <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#8f6e59]">
                                        <Icon className="h-[15px] w-[15px] stroke-[1.7]" />
                                        {card.label}
                                    </div>
                                    <p className="text-[14px] leading-[1.25] text-[#2f2925]">{card.value}</p>
                                </Link>
                            );
                        })}
                    </div>
                </section>

                <section className="px-6 py-7 sm:px-8">
                    <h2 className="text-[26px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>My Lists</h2>
                    <div className="mt-3 px-2">
                        <Link href="/favorites" className="flex items-center justify-between border-b border-[#d9cfc7] px-4 py-7 transition hover:bg-[#ede7df]/40">
                            <span className="text-[16px] text-[#2f2925]">Favorites</span>
                            <span className="flex items-center gap-2 text-[16px] text-[#8a7667]">
                                {favoriteCount} items
                                <ChevronRight className="h-4 w-4" />
                            </span>
                        </Link>
                        <div className="flex items-center justify-between border-b border-[#d9cfc7] px-4 py-7">
                            <span className="text-[16px] text-[#2f2925]">Eid Collection</span>
                            <span className="flex items-center gap-2 text-[16px] text-[#8a7667]">
                                0 items
                                <ChevronRight className="h-4 w-4" />
                                <Trash2 className="h-4 w-4" />
                            </span>
                        </div>
                    </div>
                </section>

                <section className="px-6 pb-8 sm:px-8 sm:pb-10">
                    <h2 className="text-[26px] leading-none text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>Settings</h2>
                    <div className="mt-4 space-y-4">
                        <Link href="/dashboard/settings" className="flex items-center justify-between rounded-[22px] border border-[#d9cfc7] bg-[#f4efea] px-5 py-5 transition hover:bg-[#ede7df]">
                            <span className="flex items-center gap-3.5 text-[15px] text-[#2f2925]">
                                <UserRound className="h-5 w-5 text-[#8f6e59]" />
                                Edit Profile & Account
                            </span>
                            <ChevronRight className="h-5 w-5 text-[#8f6e59]" />
                        </Link>

                        <Link href="/policies" scroll className="flex items-center justify-between rounded-[22px] border border-[#d9cfc7] bg-[#f4efea] px-5 py-5 transition hover:bg-[#ede7df]">
                            <span className="flex items-center gap-3.5 text-[15px] text-[#2f2925]">
                                <FileText className="h-5 w-5 text-[#8f6e59]" />
                                Policy
                            </span>
                            <ChevronRight className="h-5 w-5 text-[#8f6e59]" />
                        </Link>

                        <Link href="/dashboard/settings" className="flex items-center justify-between rounded-[22px] border border-[#d9cfc7] bg-[#f4efea] px-5 py-5 transition hover:bg-[#ede7df]">
                            <span className="flex items-center gap-3.5 text-[15px] text-[#2f2925]">
                                <CircleHelp className="h-5 w-5 text-[#8f6e59]" />
                                Support & FAQ
                            </span>
                            <ChevronRight className="h-5 w-5 text-[#8f6e59]" />
                        </Link>

                        <a href="/logout" className="mt-3 inline-flex w-full items-center justify-center rounded-[22px] border border-[#d9cfc7] bg-[#f4efea] px-5 py-5 text-[15px] text-[#2f2925] transition hover:bg-[#ede7df]">
                            Log out
                        </a>
                    </div>
                </section>
            </div>
        </div>
    );
}
