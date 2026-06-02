"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
    listMyNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    type NotificationRecord,
} from "@/app/actions/notifications";

type NotificationsBellButtonProps = {
    unreadCount: number;
};

function timeAgo(ts: number) {
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return "just now";
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
}

export default function NotificationsBellButton({ unreadCount }: NotificationsBellButtonProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<NotificationRecord[] | null>(null);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(event: MouseEvent) {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            const result = await listMyNotifications({ limit: 10 });
            if (cancelled) return;
            setItems(result);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    async function handleRowClick(item: NotificationRecord) {
        if (!item.readAt) {
            setItems((prev) =>
                prev ? prev.map((n) => (n.id === item.id ? { ...n, readAt: Date.now() } : n)) : prev
            );
            void markNotificationRead(item.id);
        }
        setOpen(false);
        if (item.linkUrl) {
            router.push(item.linkUrl);
        }
    }

    async function handleMarkAll() {
        setItems((prev) => (prev ? prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })) : prev));
        await markAllNotificationsRead();
        router.refresh();
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
                aria-label="Notifications"
                aria-expanded={open}
                aria-haspopup="menu"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                    <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                ) : null}
            </button>

            {open ? (
                <div
                    role="menu"
                    className="absolute right-0 top-12 z-50 w-[340px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_50px_rgba(60,40,30,0.18)]"
                >
                    <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                        <span className="text-sm font-medium text-foreground">Notifications</span>
                        <button
                            type="button"
                            onClick={handleMarkAll}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                            disabled={!items || items.every((n) => n.readAt)}
                        >
                            Mark all as read
                        </button>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto">
                        {loading ? (
                            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</div>
                        ) : !items || items.length === 0 ? (
                            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                                You&apos;re all caught up.
                            </div>
                        ) : (
                            <ul className="divide-y divide-border/60">
                                {items.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleRowClick(item)}
                                            className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-secondary ${
                                                item.readAt ? "" : "bg-secondary/30"
                                            }`}
                                        >
                                            <span
                                                className={`text-sm leading-tight ${
                                                    item.readAt ? "text-foreground/80" : "font-semibold text-foreground"
                                                }`}
                                            >
                                                {item.title}
                                            </span>
                                            <span className="line-clamp-1 text-xs text-muted-foreground">{item.body}</span>
                                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                                {timeAgo(item.createdAt)}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="border-t border-border/60 px-4 py-2 text-center">
                        <Link
                            href="/notifications"
                            onClick={() => setOpen(false)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            See all
                        </Link>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
