"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
    markAllNotificationsRead,
    markNotificationRead,
    type NotificationRecord,
} from "@/app/actions/notifications";

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

export default function NotificationsClient({ initialNotifications }: { initialNotifications: NotificationRecord[] }) {
    const router = useRouter();
    const [items, setItems] = useState<NotificationRecord[]>(initialNotifications);

    const hasUnread = items.some((n) => !n.readAt);

    async function handleRowClick(item: NotificationRecord) {
        if (!item.readAt) {
            setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: Date.now() } : n)));
            void markNotificationRead(item.id);
        }
        if (item.linkUrl) {
            router.push(item.linkUrl);
        }
    }

    async function handleMarkAll() {
        setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
        await markAllNotificationsRead();
        router.refresh();
    }

    return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
            <div className="flex items-center justify-between gap-4 pb-4">
                <h1 className="font-serif text-3xl text-foreground">Notifications</h1>
                <button
                    type="button"
                    onClick={handleMarkAll}
                    disabled={!hasUnread}
                    className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                    Mark all as read
                </button>
            </div>

            {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-20 text-center">
                    <Bell className="mb-4 h-10 w-10 text-muted-foreground/50" />
                    <h2 className="font-serif text-2xl text-foreground">You&apos;re all caught up</h2>
                    <p className="mt-2 text-sm text-muted-foreground">New sale and delivery alerts will show up here.</p>
                </div>
            ) : (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
                    {items.map((item) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                onClick={() => handleRowClick(item)}
                                className={`flex w-full flex-col items-start gap-1 px-5 py-4 text-left transition-colors hover:bg-secondary ${
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
                                <span className="text-sm text-muted-foreground">{item.body}</span>
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                                    {timeAgo(item.createdAt)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
