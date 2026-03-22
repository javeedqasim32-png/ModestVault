import { ReactNode } from "react";
import Link from "next/link";
import { CirclePlus, Heart, House, LayoutDashboard, LogOut, Settings, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login?callbackUrl=/dashboard");
    }

    const navLinks = [
        { name: "Home", href: "/dashboard", icon: House },
        { name: "Explore", href: "/browse", icon: LayoutDashboard },
        { name: "Orders", href: "/dashboard/purchases", icon: ShoppingBag },
        { name: "Favorites", href: "/favorites", icon: Heart },
        { name: "Sell", href: "/sell", icon: CirclePlus },
        { name: "Sales", href: "/dashboard/sales", icon: TrendingUp },
        { name: "Earnings", href: "/dashboard/earnings", icon: Wallet },
        { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ];

    return (
        <div className="flex-1 w-full px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-[1360px] overflow-hidden bg-card sm:rounded-[2rem] sm:border sm:border-border/80 sm:shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
                <aside className="hidden w-[310px] shrink-0 border-r border-border/80 bg-[linear-gradient(180deg,#f8f3f0_0%,#f1e7e1_100%)] lg:flex lg:flex-col">
                    <div className="border-b border-border/80 px-8 py-10">
                        <div className="mb-8 flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,#b89881_0%,#7f5f4e_100%)] text-lg font-semibold text-white shadow-[0_12px_30px_rgba(111,81,67,0.18)]">
                                {session.user.name?.[0]?.toUpperCase() || "U"}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-3xl font-serif text-foreground">{session.user.name}</p>
                                <p className="truncate text-base text-muted-foreground">{session.user.email}</p>
                            </div>
                        </div>
                    </div>

                    <nav className="flex-1 space-y-1 px-4 py-5">
                        {navLinks.map((link) => {
                            const Icon = link.icon;
                            return (
                                <Link key={link.name} href={link.href}>
                                    <div className="flex items-center gap-4 rounded-2xl px-4 py-4 text-[1.08rem] text-foreground/85 hover:bg-background hover:text-foreground">
                                        <Icon className="h-5 w-5 text-primary" />
                                        {link.name}
                                    </div>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="border-t border-border/80 px-4 py-5">
                        <form
                            action={async () => {
                                "use server";
                                await signOut();
                            }}
                        >
                            <button
                                type="submit"
                                className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-[1.08rem] text-foreground/85 hover:bg-background hover:text-foreground"
                            >
                                <LogOut className="h-5 w-5 text-primary" />
                                Log Out
                            </button>
                        </form>
                    </div>
                </aside>

                <main className="flex-1 bg-card">
                    <div className="min-h-[600px] p-0 sm:p-5 md:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
