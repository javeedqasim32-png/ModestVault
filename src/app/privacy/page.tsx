import type { Metadata } from "next";
import PrivacyBody from "@/components/policies/PrivacyBody";

/**
 * Dedicated Privacy Policy page.
 *
 * Twilio A2P 10DLC / TCR campaign submissions register this URL as the
 * Privacy Policy link for the SMS opt-in program. Reviewers land
 * directly here (not via a hub page or accordion) and need to see the
 * document as a self-contained page — the SMS/text-messaging subsection
 * (including non-sharing language) must be visible without any further
 * navigation.
 *
 * Body content is sourced from the single shared <PrivacyBody /> component
 * so this page and the "Privacy Policy" accordion inside /policies can
 * never drift out of sync.
 */

export const metadata: Metadata = {
    title: "Privacy Policy — Modaire",
    description:
        "Modaire's Privacy Policy: what data we collect, how we use it, and how we protect your SMS opt-in information.",
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#f4efea]">
            <div className="mx-auto w-full max-w-[860px] border-y border-[#ddd3cb] bg-[#f4efea] px-6 py-10 sm:px-8 sm:py-14">
                <h1 className="mb-2 text-[28px] leading-tight text-[#2f2925] sm:text-[32px]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 400 }}>
                    Privacy Policy
                </h1>
                <p className="mb-8 text-[14px] text-[#8a7667]">
                    Last updated: July 2026
                </p>

                <div className="text-[15px] leading-[1.6] text-[#4a3d33]">
                    <PrivacyBody />
                </div>
            </div>
        </div>
    );
}
