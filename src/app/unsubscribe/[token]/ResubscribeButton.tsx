"use client";

import { useState, useTransition } from "react";
import { resubscribe } from "./actions";

export function ResubscribeButton({ userId }: { userId: string }) {
    const [isPending, startTransition] = useTransition();
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (done) {
        return (
            <p className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
                You&apos;re resubscribed. Welcome back.
            </p>
        );
    }

    return (
        <>
            <button
                type="button"
                disabled={isPending}
                onClick={() => {
                    setError(null);
                    startTransition(async () => {
                        const res = await resubscribe(userId);
                        if (res.ok) setDone(true);
                        else setError(res.error);
                    });
                }}
                className="rounded-full border border-border bg-background px-5 py-2 text-xs font-semibold text-foreground disabled:opacity-60"
            >
                {isPending ? "Resubscribing…" : "Actually, resubscribe me"}
            </button>
            {error ? (
                <p className="text-xs text-red-700">{error}</p>
            ) : null}
        </>
    );
}
