import { ReactNode } from "react";
import Link from "next/link";
import { User, ShoppingBag, Tag, DollarSign, Settings, TrendingUp, LayoutDashboard } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login?callbackUrl=/dashboard");
    }

    const navLinks = [
        { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
        { name: "My Purchases", href: "/dashboard/purchases", icon: ShoppingBag },
        { name: "My Listings", href: "/dashboard/listings", icon: Tag },
        { name: "My Sales", href: "/dashboard/sales", icon: TrendingUp },
        { name: "My Earnings", href: "/dashboard/earnings", icon: DollarSign },
    ];

    return (
        <div className="flex-1 w-full bg-background">
            <div className="container mx-auto px-6 lg:px-10 py-12 flex flex-col lg:flex-row gap-12">
                {/* Sidebar */}
                <aside className="w-full lg:w-60 shrink-0">
                    <div className="sticky top-40 space-y-8">
                        {/* User Info */}
                        <div className="pb-6 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground">
                                    {session.user.name?.[0]?.toUpperCase() || "U"}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-sm font-medium text-foreground truncate">{session.user.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
                                </div>
                            </div>
                        </div>

                        {/* Nav */}
                        <nav className="space-y-1">
                            {navLinks.map((link) => {
                                const Icon = link.icon;
                                return (
                                    <Link key={link.name} href={link.href}>
                                        <div className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                                            <Icon className="w-4 h-4" />
                                            {link.name}
                                        </div>
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Quick Action */}
                        <div className="pt-4 border-t border-border">
                            <Link href="/sell" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
                                <Tag className="w-4 h-4" />
                                New Listing
                            </Link>
                        </div>
                    </div>
                </aside>

                {/* Content */}
                <main className="flex-1 min-h-[600px]">
                    {children}
                </main>
            </div>
        </div>
    );
}
