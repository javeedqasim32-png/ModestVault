import type { Metadata } from "next";
import SmsPolicyBody from "@/components/policies/SmsPolicyBody";

/**
 * Dedicated SMS/text messaging policy page.
 *
 * Twilio A2P 10DLC and The Campaign Registry (TCR) reviewers land on
 * the URL you submit and need to see substantive, visible policy
 * content immediately. Burying SMS terms inside a collapsed accordion
 * on /policies is a known cause of campaign rejection — this page
 * exists specifically so the reviewer can validate consent language,
 * message frequency, opt-out instructions, and non-sharing without
 * clicking anything.
 *
 * Content is sourced from the single shared <SmsPolicyBody /> component
 * so this page and the "SMS Communications" section inside
 * /policies#terms can never drift out of sync.
 */

export const metadata: Metadata = {
    title: "SMS Policy — Modaire",
    description:
        "Modaire's SMS/text messaging policy: what messages we send, how often, how to opt out, and how we protect your phone number.",
};

export default function SmsPolicyPage() {
    return (
        <div className="min-h-screen bg-[#f4efea]">
            <div className="mx-auto w-full max-w-[860px] border-y border-[#ddd3cb] bg-[#f4efea] px-6 py-10 sm:px-8 sm:py-14">
                <h1 className="mb-2 text-[28px] leading-tight text-[#2f2925] sm:text-[32px]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 400 }}>
                    SMS Policy
                </h1>
                <p className="mb-8 text-[14px] text-[#8a7667]">
                    Last updated: July 2026
                </p>

                <div className="text-[15px] leading-[1.6] text-[#4a3d33]">
                    <SmsPolicyBody />
                </div>
            </div>
        </div>
    );
}
