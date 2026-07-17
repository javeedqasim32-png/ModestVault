import { prisma } from "@/lib/prisma";
import { MarketingQueueClient } from "./MarketingQueueClient";

export const dynamic = "force-dynamic";

/**
 * Marketing queue — actionable + recent drafts grouped under their
 * Director briefing. Admin sees "why was this made" (theme +
 * rationale) alongside individual drafts.
 *
 * PENDING = needs your approve/reject decision.
 * APPROVED = ready to post (download image, copy caption, publish manually).
 * POSTED = recent history at the bottom for reference.
 * REJECTED = filtered out (stays in DB for audit, not shown).
 */
export default async function MarketingQueuePage() {
    const drafts = await prisma.marketingDraft.findMany({
        where: {
            status: { in: ["PENDING", "APPROVED", "POSTED"] },
        },
        orderBy: [{ created_at: "desc" }],
        include: {
            listing: {
                select: {
                    id: true,
                    title: true,
                    price: true,
                    image_url: true,
                },
            },
            briefing: {
                select: {
                    id: true,
                    ran_at: true,
                    theme: true,
                    rationale: true,
                },
            },
        },
        take: 50,
    });

    // Custom sort: PENDING first (needs decision), APPROVED next
    // (ready to publish), POSTED last (recent history).
    const statusOrder: Record<string, number> = {
        PENDING: 0,
        APPROVED: 1,
        POSTED: 2,
    };
    drafts.sort((a, b) => {
        const oa = statusOrder[a.status] ?? 99;
        const ob = statusOrder[b.status] ?? 99;
        if (oa !== ob) return oa - ob;
        return b.created_at.getTime() - a.created_at.getTime();
    });

    const serializable = drafts.map((d) => ({
        id: d.id,
        platform: d.platform,
        contentType: d.content_type,
        caption: d.caption,
        hashtags: d.hashtags ?? "",
        assetUrls: d.asset_urls,
        status: d.status,
        rejectReason: d.reject_reason,
        postedUrl: d.posted_url,
        postedAt: d.posted_at?.toISOString() ?? null,
        createdAt: d.created_at.toISOString(),
        hook: d.hook,
        angle: d.angle,
        briefing: d.briefing
            ? {
                id: d.briefing.id,
                theme: d.briefing.theme,
                rationale: d.briefing.rationale,
                ranAt: d.briefing.ran_at.toISOString(),
            }
            : null,
        listing: d.listing
            ? {
                id: d.listing.id,
                title: d.listing.title,
                price: Number(d.listing.price),
            }
            : null,
    }));

    // Also fetch the most recent briefing so the page header shows
    // today's strategy even if all today's drafts are already POSTED
    // (or if there are none yet).
    const latestBriefing = await prisma.marketingBriefing.findFirst({
        orderBy: { ran_at: "desc" },
        select: { id: true, ran_at: true, theme: true, rationale: true, content_mix: true },
    });

    const pendingCount = drafts.filter((d) => d.status === "PENDING").length;
    const approvedCount = drafts.filter((d) => d.status === "APPROVED").length;
    const postedCount = drafts.filter((d) => d.status === "POSTED").length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black tracking-tight text-foreground">Marketing queue</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    AI-drafted posts. Approve to unlock the download + caption, post manually, then mark posted.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">Pending {pendingCount}</span>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">Approved {approvedCount}</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Posted {postedCount}</span>
                </div>
            </div>

            {latestBriefing ? (
                <div className="rounded-2xl border border-foreground/10 bg-gradient-to-br from-[#efe6dd] to-[#f7f3ef] p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#a07c61]">
                        Director's brief · {new Date(latestBriefing.ran_at).toLocaleString()}
                    </p>
                    <h2 className="mt-2 font-serif text-xl font-bold text-[#2f2925] md:text-2xl">
                        {latestBriefing.theme}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-[#4a3d33]">{latestBriefing.rationale}</p>
                </div>
            ) : null}

            <MarketingQueueClient drafts={serializable} />
        </div>
    );
}
