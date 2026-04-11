"use client";

import { ShoppingBag } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const LAST_NON_CART_PATH_KEY = "modaire:lastNonCartPath";

export default function BagNavButton({ cartCount }: { cartCount: number }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const isCartRoute = pathname.startsWith("/cart");
    const query = searchParams.toString();

    useEffect(() => {
        if (isCartRoute) return;
        const nextPath = query ? `${pathname}?${query}` : pathname;
        window.sessionStorage.setItem(LAST_NON_CART_PATH_KEY, nextPath);
    }, [isCartRoute, pathname, query]);

    return (
        <button
            type="button"
            onClick={() => {
                if (isCartRoute) {
                    const lastNonCartPath = window.sessionStorage.getItem(LAST_NON_CART_PATH_KEY) || "/";
                    router.push(lastNonCartPath);
                    return;
                }
                router.push("/cart");
            }}
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
            aria-label={isCartRoute ? "Close bag" : "Open bag"}
        >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                    {cartCount > 99 ? "99+" : cartCount}
                </span>
            ) : null}
        </button>
    );
}

