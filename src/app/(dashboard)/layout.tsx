import { ReactNode } from "react";
import Link from "next/link";
import { CirclePlus, Heart, House, LayoutDashboard, LogIn, LogOut, Settings, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { auth } from "@/auth";

/**
 * NOTE: no auth redirect here. The Dashboard is intentionally
 * PUBLIC so anonymous visitors (and TCR / Twilio A2P 10DLC compliance
 * reviewers) can reach the Policy link without needing an account.
 * Individual routes underneath (/dashboard/purchases, /dashboard/sales,
 * etc.) still enforce auth from their own pages — clicking a personal
 * card just redirects to /login with the intended destination as
 * callbackUrl.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const session = await auth();
    const isAuthed = !!session?.user?.id;

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
        <div className="flex-1 w-full bg-[#f4efea] px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-[1360px] overflow-hidden bg-[#f4efea] sm:rounded-[2rem] sm:border sm:border-border/80 sm:shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
                <aside className="hidden w-[310px] shrink-0 border-r border-border/80 bg-[linear-gradient(180deg,#f8f3f0_0%,#f1e7e1_100%)] lg:flex lg:flex-col">
                    <div className="border-b border-border/80 px-8 py-10">
                        <div className="mb-8 flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,#b89881_0%,#7f5f4e_100%)] text-lg font-semibold text-white shadow-[0_12px_30px_rgba(111,81,67,0.18)]">
                                {isAuthed ? (session.user?.name?.[0]?.toUpperCase() || "U") : "?"}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-3xl font-serif text-foreground">
                                    {isAuthed ? session.user?.name : "Welcome"}
                                </p>
                                <p className="truncate text-base text-muted-foreground">
                                    {isAuthed ? session.user?.email : "Sign in to see your account"}
                                </p>
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
                        {isAuthed ? (
                            <a
                                href="/logout"
                                className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-[1.08rem] text-foreground/85 hover:bg-background hover:text-foreground"
                            >
                                <LogOut className="h-5 w-5 text-primary" />
                                Log Out
                            </a>
                        ) : (
                            <Link
                                href="/login?callbackUrl=/dashboard"
                                className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-[1.08rem] text-foreground/85 hover:bg-background hover:text-foreground"
                            >
                                <LogIn className="h-5 w-5 text-primary" />
                                Sign In
                            </Link>
                        )}
                    </div>
                </aside>

                <main className="flex-1 bg-[#f4efea]">
                    <div className="min-h-[600px] p-0 sm:p-5 md:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
