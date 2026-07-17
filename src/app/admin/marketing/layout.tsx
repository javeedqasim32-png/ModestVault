import Link from "next/link";

/**
 * Marketing sub-nav — tabs for Queue / Published / Insights. Only Queue
 * exists in Phase 1; the other tabs are placeholders that route to
 * later-phase pages. Auth is enforced by the outer /admin layout.
 */
export default function AdminMarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-border pb-3">
                <Link
                    href="/admin/marketing/queue"
                    className="rounded-full bg-foreground/5 px-4 py-2 text-sm font-semibold text-foreground hover:bg-foreground/10"
                >
                    Queue
                </Link>
                <span className="cursor-not-allowed rounded-full px-4 py-2 text-sm font-medium text-muted-foreground/60" title="Coming in a later phase">
                    Published
                </span>
                <span className="cursor-not-allowed rounded-full px-4 py-2 text-sm font-medium text-muted-foreground/60" title="Coming in a later phase">
                    Insights
                </span>
            </div>
            {children}
        </div>
    );
}
