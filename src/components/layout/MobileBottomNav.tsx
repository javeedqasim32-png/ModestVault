"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Star, CirclePlus, WalletCards, User2 } from "lucide-react";

const hiddenRoutes = ["/login", "/signup"];

const items = [
    { href: "/", label: "Home", icon: House, match: (pathname: string) => pathname === "/" },
    { href: "/browse", label: "Explore", icon: Star, match: (pathname: string) => pathname.startsWith("/browse") || pathname.startsWith("/listings") },
    { href: "/sell", label: "Sell", icon: CirclePlus, match: (pathname: string) => pathname.startsWith("/sell") },
    { href: "/dashboard/purchases", label: "Orders", icon: WalletCards, match: (pathname: string) => pathname.startsWith("/dashboard/purchases") },
    {
        href: "/dashboard",
        label: "Profile",
        icon: User2,
        match: (pathname: string) =>
            pathname.startsWith("/dashboard") &&
            !pathname.startsWith("/dashboard/purchases"),
    },
];

export default function MobileBottomNav() {
    const pathname = usePathname();

    if (hiddenRoutes.some((route) => pathname.startsWith(route))) {
        return null;
    }

    return (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-[#fbf8f4]/98 px-2 py-2 backdrop-blur-xl lg:hidden">
            <div className="mx-auto flex max-w-xl items-center justify-between gap-1 px-1">
                {items.map((item) => {
                    const Icon = item.icon;
                    const active = item.match(pathname);

                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[1rem] px-1 py-2 text-[11px] transition-colors ${
                                active
                                    ? "bg-[#ece4dc] text-black"
                                    : "text-foreground/72 hover:bg-white/60"
                            }`}
                        >
                            <span
                                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                                    active
                                        ? "h-10 w-10 shrink-0 !bg-black !text-white border border-black shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                                        : "text-current"
                                }`}
                            >
                                <Icon className="h-5 w-5" />
                            </span>
                            <span className={`truncate ${active ? "font-semibold text-black" : ""}`}>{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
