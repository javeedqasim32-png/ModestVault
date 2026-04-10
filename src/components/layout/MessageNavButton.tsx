"use client";

import { MessageCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const LAST_NON_MESSAGES_PATH_KEY = "modaire:lastNonMessagesPath";

export default function MessageNavButton({ unreadMessageCount }: { unreadMessageCount: number }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const isMessagesRoute = pathname.startsWith("/messages");
    const query = searchParams.toString();

    useEffect(() => {
        if (isMessagesRoute) return;
        const nextPath = query ? `${pathname}?${query}` : pathname;
        window.sessionStorage.setItem(LAST_NON_MESSAGES_PATH_KEY, nextPath);
    }, [isMessagesRoute, pathname, query]);

    return (
        <button
            type="button"
            onClick={() => {
                if (isMessagesRoute) {
                    const lastNonMessagesPath = window.sessionStorage.getItem(LAST_NON_MESSAGES_PATH_KEY) || "/";
                    router.push(lastNonMessagesPath);
                    return;
                }
                router.push("/messages");
            }}
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
            aria-label={isMessagesRoute ? "Close messages" : "Open messages"}
        >
            <MessageCircle className="h-5 w-5" />
            {unreadMessageCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </span>
            ) : null}
        </button>
    );
}
