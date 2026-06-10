"use client";

import { useEffect, useState } from "react";

/**
 * Renders a message timestamp in the viewer's local timezone.
 *
 * Why a client component: the surrounding pages are server components, so any
 * `date.toLocaleTimeString()` on the server uses the EC2 box's timezone (UTC
 * by default) — every user worldwide ends up seeing UTC. By formatting on
 * mount in the client, each browser uses its own timezone.
 *
 * We render an empty span server-side and fill it in `useEffect` so the
 * initial HTML never embeds a misleading server-timezone value. The empty
 * placeholder is briefly visible on slow networks but it's preferable to
 * showing the wrong time, even for a fraction of a second.
 */
type Variant = "thread" | "list";

function formatLocal(date: Date, variant: Variant): string {
    if (variant === "list") {
        // Conversation-list rows show only the date, no time.
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    // Thread + read-receipt formatting: same logic the server used previously,
    // just now running on the client so the runtime timezone is the viewer's.
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const sameYear = date.getFullYear() === now.getFullYear();

    if (sameDay) {
        return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (sameYear) {
        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    }
    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function MessageTimestamp({
    iso,
    variant = "thread",
}: {
    /** ISO-8601 timestamp from the server (UTC). */
    iso: string;
    variant?: Variant;
}) {
    const [text, setText] = useState<string>("");
    useEffect(() => {
        setText(formatLocal(new Date(iso), variant));
    }, [iso, variant]);
    // suppressHydrationWarning is defensive: even though `text` starts empty
    // on both server and client, future React versions or framework changes
    // might re-render between SSR and hydration in ways that diverge.
    return <span suppressHydrationWarning>{text}</span>;
}
