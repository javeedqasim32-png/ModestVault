"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const LAST_NON_FAVORITES_PATH_KEY = "modaire:lastNonFavoritesPath";

export default function FavoritesNavButton({ favoriteCount }: { favoriteCount: number }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const isFavoritesRoute = pathname.startsWith("/favorites");
    const query = searchParams.toString();

    useEffect(() => {
        if (isFavoritesRoute) return;
        const nextPath = query ? `${pathname}?${query}` : pathname;
        window.sessionStorage.setItem(LAST_NON_FAVORITES_PATH_KEY, nextPath);
    }, [isFavoritesRoute, pathname, query]);

    return (
        <button
            type="button"
            onClick={() => {
                if (isFavoritesRoute) {
                    const lastNonFavoritesPath = window.sessionStorage.getItem(LAST_NON_FAVORITES_PATH_KEY) || "/";
                    router.push(lastNonFavoritesPath);
                    return;
                }
                router.push("/favorites");
            }}
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
            aria-label={isFavoritesRoute ? "Close favorites" : "Open favorites"}
        >
            <Heart className="h-5 w-5" />
            {favoriteCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                    {favoriteCount > 99 ? "99+" : favoriteCount}
                </span>
            ) : null}
        </button>
    );
}

