"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, XCircle, Download, Copy, ExternalLink, Facebook, Instagram, Send, Check } from "lucide-react";
import { approveDraft, rejectDraft, markAsPosted } from "@/app/actions/marketing";

type DraftView = {
    id: string;
    platform: string;
    contentType: string;
    caption: string;
    hashtags: string;
    assetUrls: string[];
    status: string;
    rejectReason: string | null;
    postedUrl: string | null;
    createdAt: string;
    postedAt: string | null;
    hook: string | null;
    angle: string | null;
    briefing: { id: string; theme: string; rationale: string; ranAt: string } | null;
    listing: { id: string; title: string; price: number } | null;
};

const PLATFORM_META: Record<string, { label: string; Icon: typeof Facebook }> = {
    FACEBOOK: { label: "Facebook", Icon: Facebook },
    INSTAGRAM_FEED: { label: "Instagram Feed", Icon: Instagram },
    INSTAGRAM_STORY: { label: "IG Story", Icon: Instagram },
    INSTAGRAM_REEL: { label: "IG Reel", Icon: Instagram },
    TIKTOK: { label: "TikTok", Icon: Send },
};

export function MarketingQueueClient({ drafts }: { drafts: DraftView[] }) {
    if (drafts.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                <p className="text-lg font-semibold text-foreground">Queue is empty</p>
                <p className="mt-2 text-sm text-muted-foreground">
                    The next daily generate cron will populate this. Or trigger it manually with{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">POST /api/internal/marketing/generate</code>.
                </p>
            </div>
        );
    }
    return (
        <div className="space-y-4">
            {drafts.map((d) => (
                <DraftCard key={d.id} draft={d} />
            ))}
        </div>
    );
}

function DraftCard({ draft }: { draft: DraftView }) {
    const [isPending, startTransition] = useTransition();
    const [caption, setCaption] = useState(draft.caption);
    const [hashtags, setHashtags] = useState(draft.hashtags);
    const [rejectMode, setRejectMode] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [postedMode, setPostedMode] = useState(false);
    const [postedUrl, setPostedUrl] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [copyDone, setCopyDone] = useState(false);

    const platformMeta = PLATFORM_META[draft.platform] ?? { label: draft.platform, Icon: Facebook };
    const PlatformIcon = platformMeta.Icon;
    const isPending_status = draft.status === "PENDING";
    const isApproved = draft.status === "APPROVED";
    const isPosted = draft.status === "POSTED";
    const canEdit = isPending_status;

    function handleApprove() {
        setError(null);
        startTransition(async () => {
            const res = await approveDraft({ id: draft.id, caption, hashtags });
            if (!res.ok) setError(res.error);
        });
    }
    function handleReject() {
        if (!rejectReason.trim()) {
            setError("Reason required to reject");
            return;
        }
        setError(null);
        startTransition(async () => {
            const res = await rejectDraft({ id: draft.id, reason: rejectReason.trim() });
            if (!res.ok) setError(res.error);
        });
    }
    function handleMarkPosted() {
        setError(null);
        startTransition(async () => {
            const res = await markAsPosted({ id: draft.id, postedUrl: postedUrl.trim() || undefined });
            if (!res.ok) setError(res.error);
        });
    }
    async function handleCopy() {
        const text = hashtags ? `${caption}\n\n${hashtags}` : caption;
        try {
            await navigator.clipboard.writeText(text);
            setCopyDone(true);
            setTimeout(() => setCopyDone(false), 1800);
        } catch {
            setError("Clipboard copy failed — select the text manually.");
        }
    }

    return (
        <div className="grid grid-cols-1 gap-5 rounded-2xl border border-border bg-card p-5 md:grid-cols-[280px_1fr]">
            {/* Preview column */}
            <div className="space-y-2">
                {draft.assetUrls[0] ? (
                    // 9:16 aspect matches the Story-format asset both
                    // ImageAgent (PNG) and VideoAgent (MP4) produce.
                    <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-border bg-black">
                        {draft.contentType === "VIDEO" ? (
                            <video
                                src={draft.assetUrls[0]}
                                controls
                                playsInline
                                preload="metadata"
                                className="absolute inset-0 h-full w-full object-contain"
                            />
                        ) : (
                            <Image
                                src={draft.assetUrls[0]}
                                alt="Draft preview"
                                fill
                                className="object-contain"
                                sizes="280px"
                                unoptimized
                            />
                        )}
                    </div>
                ) : (
                    <div className="aspect-[9/16] rounded-xl border border-dashed border-border" />
                )}
                <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-1 font-semibold text-foreground">
                        <PlatformIcon className="h-3.5 w-3.5" />
                        {platformMeta.label}
                    </span>
                    <StatusBadge status={draft.status} />
                </div>
                {draft.listing ? (
                    <Link
                        href={`/listings/${draft.listing.id}`}
                        target="_blank"
                        className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        <ExternalLink className="h-3 w-3" />
                        {draft.listing.title} — ${draft.listing.price.toFixed(2)}
                    </Link>
                ) : null}
            </div>

            {/* Editor + actions column */}
            <div className="space-y-3">
                {draft.hook || draft.angle ? (
                    <div className="rounded-lg border border-[#e3d9d1] bg-[#fbf8f5] p-3 text-[11px] leading-relaxed">
                        {draft.hook ? (
                            <p>
                                <span className="font-bold uppercase tracking-widest text-[#a07c61]">Hook:</span>{" "}
                                <span className="text-[#2f2925]">{draft.hook}</span>
                            </p>
                        ) : null}
                        {draft.angle ? (
                            <p className={draft.hook ? "mt-1" : ""}>
                                <span className="font-bold uppercase tracking-widest text-[#a07c61]">Angle:</span>{" "}
                                <span className="text-[#4a3d33]">{draft.angle}</span>
                            </p>
                        ) : null}
                    </div>
                ) : null}
                <div>
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Caption</label>
                    <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        rows={4}
                        disabled={!canEdit || isPending}
                        className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground disabled:opacity-70"
                    />
                </div>
                <div>
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Hashtags</label>
                    <input
                        value={hashtags}
                        onChange={(e) => setHashtags(e.target.value)}
                        disabled={!canEdit || isPending}
                        className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground disabled:opacity-70"
                    />
                </div>

                {isPosted ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                        <p className="font-semibold">Posted {draft.postedAt ? new Date(draft.postedAt).toLocaleString() : ""}</p>
                        {draft.postedUrl ? (
                            <p className="mt-1">
                                <a href={draft.postedUrl} target="_blank" rel="noreferrer" className="underline">
                                    View live post →
                                </a>
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {error ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div>
                ) : null}

                {/* ── PENDING: Approve / Reject ── */}
                {isPending_status && !rejectMode ? (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleApprove}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2 text-xs font-semibold text-background disabled:opacity-60"
                        >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve for posting
                        </button>
                        <button
                            type="button"
                            onClick={() => setRejectMode(true)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2 text-xs font-semibold"
                        >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                        </button>
                    </div>
                ) : null}

                {/* ── APPROVED: Download / Copy / Mark posted / Reject ── */}
                {isApproved && !postedMode && !rejectMode ? (
                    <>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            <p className="font-semibold">Ready to post.</p>
                            <p className="mt-1 opacity-80">Download the image, copy the caption, post it manually on {platformMeta.label}. Then mark as posted here.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {draft.assetUrls[0] ? (
                                <a
                                    href={draft.assetUrls[0]}
                                    download
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    {draft.contentType === "VIDEO" ? "Download video" : "Download image"}
                                </a>
                            ) : null}
                            <button
                                type="button"
                                onClick={handleCopy}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
                            >
                                {copyDone ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                {copyDone ? "Copied" : "Copy caption + hashtags"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPostedMode(true)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                I posted it
                            </button>
                            <button
                                type="button"
                                onClick={() => setRejectMode(true)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold"
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                Drop
                            </button>
                        </div>
                    </>
                ) : null}

                {/* ── POSTED-mode dialog ── */}
                {postedMode ? (
                    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Post URL (optional — paste the live IG/FB link)
                        </label>
                        <input
                            value={postedUrl}
                            onChange={(e) => setPostedUrl(e.target.value)}
                            placeholder="https://www.instagram.com/p/..."
                            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleMarkPosted}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-60"
                            >
                                Confirm posted
                            </button>
                            <button
                                type="button"
                                onClick={() => setPostedMode(false)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* ── REJECT-mode dialog ── */}
                {rejectMode ? (
                    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Reason (why not posting)</label>
                        <input
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Off-brand, wrong item, unclear photo…"
                            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleReject}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                            >
                                Confirm reject
                            </button>
                            <button
                                type="button"
                                onClick={() => setRejectMode(false)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const color =
        status === "PENDING" ? "bg-amber-100 text-amber-800"
            : status === "APPROVED" ? "bg-blue-100 text-blue-800"
                : status === "POSTED" ? "bg-emerald-100 text-emerald-800"
                    : status === "REJECTED" ? "bg-red-100 text-red-800"
                        : "bg-muted text-muted-foreground";
    return (
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${color}`}>
            {status}
        </span>
    );
}
