import Link from "next/link";
import { Sparkles, Tag, Handbag, Heart, type LucideIcon } from "lucide-react";

/**
 * Horizontal quick-action row rendered on the homepage between the
 * "Trending Now" and "Featured" sections. Four one-tap shortcuts to the
 * browsing behaviors we know users want:
 *
 *   1. New In       — /browse?sort=newest
 *   2. Sale         — /browse?sale=1              (only listings with an
 *                     active accepted promotion; the sale filter
 *                     mirrors the four gates in getEffectivePriceForListing)
 *   3. Clutches     — /browse?subcategories=Bags  (aesthetic label —
 *                     filter targets the "Bags" subcategory under
 *                     Accessories in the taxonomy, which covers all bag
 *                     types the marketplace stocks)
 *   4. Saved Items  — /favorites                  (auth-gated at the
 *                     destination; the favorites page redirects to
 *                     /login with a callbackUrl if the visitor isn't
 *                     signed in — no special handling needed here)
 *
 * Pure Link elements, no client-side state — server component. Middle-
 * click / right-click open-in-new-tab behavior comes free.
 */

type Pill = {
    icon: LucideIcon;
    label: string;
    href: string;
};

const PILLS: Pill[] = [
    { icon: Sparkles, label: "New In", href: "/browse?sort=newest" },
    { icon: Tag, label: "Sale", href: "/browse?sale=1" },
    { icon: Handbag, label: "Clutches", href: "/browse?subcategories=Bags" },
    { icon: Heart, label: "Saved Items", href: "/favorites" },
];

export default function HomeQuickActions() {
    return (
        <nav
            aria-label="Quick actions"
            className="w-full overflow-x-auto no-scrollbar"
        >
            <ul className="flex gap-2 px-4 pb-4 pt-1 sm:justify-center sm:px-6">
                {PILLS.map((pill) => (
                    <li key={pill.label} className="shrink-0">
                        <Link
                            href={pill.href}
                            className="flex items-center gap-2 rounded-full border border-[#ece3dc] bg-white/95 px-4 py-2 text-[13px] font-medium text-[#a07c61] shadow-[0_1px_2px_rgba(110,82,63,0.06)] transition-colors hover:bg-[#f9f4f1] hover:text-[#8f6d54]"
                        >
                            <pill.icon className="h-4 w-4" strokeWidth={2} />
                            <span>{pill.label}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
