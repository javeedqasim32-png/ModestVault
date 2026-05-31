"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkle, Plus, Archive, User } from "lucide-react";

const hiddenRoutes = ["/login", "/signup"];

const items = [
    { href: "/", label: "Home", icon: Home, match: (pathname: string) => pathname === "/" },
    { href: "/browse", label: "Explore", icon: Sparkle, match: (pathname: string) => pathname.startsWith("/browse") || pathname.startsWith("/listings") },
    { href: "/sell", label: "Sell", icon: Plus, match: (pathname: string) => pathname.startsWith("/sell") },
    { href: "/dashboard/purchases", label: "Orders", icon: Archive, match: (pathname: string) => pathname.startsWith("/dashboard/purchases") },
    {
        href: "/dashboard",
        label: "Profile",
        icon: User,
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
    // Hide on individual message threads to give them the full viewport
    // (iMessage-style — composer pinned to the bottom edge, no nav under it).
    if (/^\/messages\/[^/]+/.test(pathname)) {
        return null;
    }

    return (
        <nav
            className="fixed inset-x-0 bottom-0 z-50 bg-background pt-3 lg:hidden"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
            <div className="mx-auto flex max-w-xl items-end justify-between gap-1 px-3">
                {items.map((item) => {
                    const Icon = item.icon;
                    const active = item.match(pathname);
                    const isSell = item.href === "/sell";

                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-1"
                        >
                            {isSell ? (
                                <span
                                    className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors shadow-[0_2px_8px_rgba(122,90,69,0.12)] ${
                                        active ? "bg-[#b89d82] text-[#3d2718]" : "bg-[#efe6dd] text-[#4a3328]"
                                    }`}
                                >
                                    <Plus className="h-7 w-7" strokeWidth={1.5} />
                                </span>
                            ) : (
                                <span
                                    className={`flex h-7 w-7 items-center justify-center ${
                                        active ? "text-[#3d2718]" : "text-[#a39082]"
                                    }`}
                                >
                                    <Icon
                                        className="h-6 w-6"
                                        strokeWidth={1.5}
                                        fill={active ? "currentColor" : "none"}
                                    />
                                </span>
                            )}
                            <span
                                className={`truncate text-[12px] leading-none ${
                                    active ? "font-semibold text-[#2f2925]" : "text-[#a39082]"
                                }`}
                            >
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
