import type { CalendarEvent, CalendarHorizon } from "./types";

/**
 * Modaire marketing calendar. Human-edited, no DB.
 *
 * Every event carries a `leadTimeDays` — how far in advance the
 * Director should start weaving anticipation content in. Eid = 30
 * days (big cultural moment, needs runway). Sales = 7 days (urgency
 * curve). Wedding season = 60 days (sustained rhythm, not a spike).
 *
 * Keep this list ordered chronologically — makes eyeballing what's
 * coming up trivial. Prune events > 30 days past to keep the file
 * shorter (they're not useful once fully in the rearview).
 *
 * When updating: add cultural events at least 60 days before their
 * start date so the Director has full anticipation runway.
 */
export const MARKETING_CALENDAR: CalendarEvent[] = [
    // ─── Ongoing / rolling ────────────────────────────────────────
    {
        slug: "wedding-season-us-summer-2026",
        name: "US Summer Wedding Season",
        kind: "seasonal",
        startsAt: "2026-05-01",
        endsAt: "2026-09-15",
        leadTimeDays: 30,
        audienceRelevance: "high",
        strategyHint:
            "Sustained wedding-guest content. Rotate: mother-of-the-bride pieces, formal abayas, wedding-guest kaftans, jewelry pairings. Emphasize versatile pieces that work for both nikah + reception.",
    },

    // ─── Modaire-specific promos ──────────────────────────────────
    {
        slug: "modaire-summer-sale-2026",
        name: "Modaire Summer Sale — 15% off",
        kind: "promo",
        startsAt: "2026-07-05",
        endsAt: "2026-07-19",
        leadTimeDays: 7,
        audienceRelevance: "high",
        strategyHint:
            "Active discount campaign. All content should reference the sale, ending with urgency copy as end date approaches. Feature ACCEPTED listings with visible strike-through pricing.",
    },

    // ─── Cultural / religious moments ─────────────────────────────
    {
        slug: "eid-al-adha-2026",
        name: "Eid al-Adha",
        kind: "cultural",
        startsAt: "2026-09-05",
        endsAt: "2026-09-07",
        leadTimeDays: 30,
        audienceRelevance: "high",
        strategyHint:
            "Massive cultural moment for Modaire's audience. Feature formal abayas, embellished kaftans, cultural gift ideas. Anticipation content 30 days out; peak intensity 7-10 days before; celebration content on the day.",
    },
    {
        slug: "ramadan-2027",
        name: "Ramadan 2027 (Feb 17 — Mar 18)",
        kind: "cultural",
        startsAt: "2027-02-17",
        endsAt: "2027-03-18",
        leadTimeDays: 45,
        audienceRelevance: "high",
        strategyHint:
            "Iftar-appropriate elegant pieces, family-gathering wear, understated luxury. Build content calendar around common Ramadan themes: reflection, community, gathering. Sales tone shifts to gentle recommendation, not urgency.",
    },
    {
        slug: "eid-al-fitr-2027",
        name: "Eid al-Fitr 2027",
        kind: "cultural",
        startsAt: "2027-03-19",
        endsAt: "2027-03-21",
        leadTimeDays: 30,
        audienceRelevance: "high",
        strategyHint:
            "Post-Ramadan celebration. Bright colors, festive kaftans, family portrait outfits, gifting ideas. Anticipation content builds during last week of Ramadan.",
    },

    // ─── US Retail / shopping calendar ────────────────────────────
    {
        slug: "back-to-school-2026",
        name: "Back-to-School Season",
        kind: "seasonal",
        startsAt: "2026-08-15",
        endsAt: "2026-09-05",
        leadTimeDays: 21,
        audienceRelevance: "medium",
        strategyHint:
            "For Modaire audience: modest everyday pieces suitable for university, professional wear, hijab-friendly workwear. Not the strongest hook for our audience but worth 1-2 posts.",
    },
    {
        slug: "black-friday-2026",
        name: "Black Friday",
        kind: "shopping",
        startsAt: "2026-11-27",
        endsAt: "2026-11-27",
        leadTimeDays: 21,
        audienceRelevance: "high",
        strategyHint:
            "Biggest shopping day. Plan a real Modaire BF sale in the runup. Buildup content 3 weeks out (early-access teases), peak intensity Black Friday morning. Also plan Cyber Monday (Nov 30).",
    },
    {
        slug: "cyber-monday-2026",
        name: "Cyber Monday",
        kind: "shopping",
        startsAt: "2026-11-30",
        endsAt: "2026-11-30",
        leadTimeDays: 14,
        audienceRelevance: "high",
        strategyHint:
            "Extension of Black Friday. If the BF sale continues, frame as 'final hours.' If separate, position as digital-only, curated.",
    },
    {
        slug: "valentines-day-2027",
        name: "Valentine's Day",
        kind: "holiday",
        startsAt: "2027-02-14",
        endsAt: "2027-02-14",
        leadTimeDays: 14,
        audienceRelevance: "low",
        strategyHint:
            "Weaker hook for modest fashion audience but can be reframed as 'treat yourself' or 'gift for her.' 1-2 posts, gentle tone.",
    },
    {
        slug: "mothers-day-us-2027",
        name: "Mother's Day (US)",
        kind: "holiday",
        startsAt: "2027-05-09",
        endsAt: "2027-05-09",
        leadTimeDays: 21,
        audienceRelevance: "high",
        strategyHint:
            "Strong hook. Curated 'gift for mom' pieces — dupattas, embroidered abayas, jewelry pairings. Emotional / community angles.",
    },
];

/**
 * Compute the four horizon windows relative to `today`. This is what
 * the Director actually consumes — a real marketer thinks in weeks
 * ahead, not just today.
 *
 *   activeToday   — event.startsAt <= today <= event.endsAt
 *   imminent      — 1-7 days until start
 *   building      — 8-30 days until start (only surfaces if within event.leadTimeDays)
 *   recentlyEnded — 0-7 days past end
 */
export function getCalendarHorizon(todayIso: string): CalendarHorizon {
    const today = parseIsoDate(todayIso);
    const activeToday: CalendarHorizon["activeToday"] = [];
    const imminent: CalendarHorizon["imminent"] = [];
    const building: CalendarHorizon["building"] = [];
    const recentlyEnded: CalendarHorizon["recentlyEnded"] = [];

    for (const ev of MARKETING_CALENDAR) {
        const start = parseIsoDate(ev.startsAt);
        const end = parseIsoDate(ev.endsAt);
        const daysUntilStart = daysBetween(today, start);
        const daysSinceEnd = daysBetween(end, today);

        if (today >= start && today <= end) {
            activeToday.push({ ...ev, daysIntoEvent: daysBetween(start, today) });
        } else if (daysUntilStart > 0 && daysUntilStart <= 7) {
            imminent.push({ ...ev, daysUntilStart });
        } else if (
            daysUntilStart > 7 &&
            daysUntilStart <= 30 &&
            daysUntilStart <= ev.leadTimeDays
        ) {
            building.push({ ...ev, daysUntilStart });
        } else if (daysSinceEnd > 0 && daysSinceEnd <= 7) {
            recentlyEnded.push({ ...ev, daysSinceEnd });
        }
    }

    return {
        today: todayIso,
        activeToday,
        imminent: imminent.sort((a, b) => a.daysUntilStart - b.daysUntilStart),
        building: building.sort((a, b) => a.daysUntilStart - b.daysUntilStart),
        recentlyEnded: recentlyEnded.sort((a, b) => a.daysSinceEnd - b.daysSinceEnd),
    };
}

/**
 * Render the horizon as a human-readable digest the Director LLM can
 * embed in its prompt. Grouped by window, ordered chronologically.
 */
export function renderCalendarHorizonForPrompt(horizon: CalendarHorizon): string {
    const lines: string[] = [];
    lines.push(`# Marketing Calendar — as of ${horizon.today}`);

    if (horizon.activeToday.length > 0) {
        lines.push("\n## Active today");
        for (const ev of horizon.activeToday) {
            lines.push(
                `- **${ev.name}** (${ev.kind}, day ${ev.daysIntoEvent + 1}) — ${ev.strategyHint}`,
            );
        }
    }
    if (horizon.imminent.length > 0) {
        lines.push("\n## Imminent (1-7 days out — urgency window)");
        for (const ev of horizon.imminent) {
            lines.push(
                `- **${ev.name}** in ${ev.daysUntilStart} day${ev.daysUntilStart === 1 ? "" : "s"} — ${ev.strategyHint}`,
            );
        }
    }
    if (horizon.building.length > 0) {
        lines.push("\n## Building (8-30 days out — anticipation window)");
        for (const ev of horizon.building) {
            lines.push(
                `- **${ev.name}** in ${ev.daysUntilStart} days — ${ev.strategyHint}`,
            );
        }
    }
    if (horizon.recentlyEnded.length > 0) {
        lines.push("\n## Recently ended (past 7 days — recap/gratitude window)");
        for (const ev of horizon.recentlyEnded) {
            lines.push(
                `- **${ev.name}** ended ${ev.daysSinceEnd} day${ev.daysSinceEnd === 1 ? "" : "s"} ago — ${ev.strategyHint}`,
            );
        }
    }
    if (
        horizon.activeToday.length === 0 &&
        horizon.imminent.length === 0 &&
        horizon.building.length === 0 &&
        horizon.recentlyEnded.length === 0
    ) {
        lines.push("\n_No calendar-hooked events in the current horizon. Rely on evergreen content angles._");
    }

    return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────
// Date math helpers — kept local so calendar.ts is self-contained.
// ────────────────────────────────────────────────────────────────────

function parseIsoDate(iso: string): Date {
    // Force UTC parse so DST doesn't shift the boundary by an hour.
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(from: Date, to: Date): number {
    const MS = 24 * 60 * 60 * 1000;
    return Math.round((to.getTime() - from.getTime()) / MS);
}
