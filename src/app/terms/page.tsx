import type { Metadata } from "next";
import TermsBody from "@/components/policies/TermsBody";

/**
 * Dedicated Terms & Conditions page.
 *
 * Twilio A2P 10DLC / TCR campaign submissions register this URL as the
 * Terms & Conditions link for the SMS opt-in program. Reviewers land
 * directly here (not via a hub page or accordion) and need to see a
 * self-contained document.
 *
 * Body content is sourced from the single shared <TermsBody /> component
 * so this page and the "Terms & Conditions" accordion inside /policies
 * can never drift out of sync.
 */

export const metadata: Metadata = {
    title: "Terms & Conditions — Modaire",
    description:
        "Modaire's Terms & Conditions: eligibility, marketplace role, user conduct, payments, SMS communications, and liability.",
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#f4efea]">
            <div className="mx-auto w-full max-w-[860px] border-y border-[#ddd3cb] bg-[#f4efea] px-6 py-10 sm:px-8 sm:py-14">
                <h1 className="mb-2 text-[28px] leading-tight text-[#2f2925] sm:text-[32px]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 400 }}>
                    Terms &amp; Conditions
                </h1>
                <p className="mb-8 text-[14px] text-[#8a7667]">
                    Last updated: July 2026
                </p>

                <div className="text-[15px] leading-[1.6] text-[#4a3d33]">
                    <TermsBody />
                </div>
            </div>
        </div>
    );
}
