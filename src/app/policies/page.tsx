"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import TermsBody from "@/components/policies/TermsBody";
import PrivacyBody from "@/components/policies/PrivacyBody";

// Sections default to OPEN. TCR/Twilio A2P 10DLC reviewers land on this
// page and need to see policy content immediately — a collapsed accordion
// reads as "no visible policy" and fails compliance review.
const DEFAULT_OPEN_STATE: Record<string, boolean> = {
  terms: true,
  privacy: true,
  seller: true,
  refunds: true,
};

const SUPPORT_EMAIL = "shopmodaire@gmail.com";

type PolicyItem = {
  id: string;
  label: string;
  body: ReactNode;
};

const policyItems: readonly PolicyItem[] = [
  {
    id: "terms",
    label: "Terms & Conditions",
    body: <TermsBody />,
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    body: <PrivacyBody />,
  },
  {
    id: "seller",
    label: "Seller Policy",
    body: (
      <div className="space-y-4">
        <p>
          Modaire supports independent sellers of modest fashion. Selling on
          Modaire requires a Stripe Connect account so that payouts can be
          delivered to your bank account.
        </p>
        <p>
          <strong>Listing accuracy.</strong> Every listing must reflect the
          item you actually have on hand. Photos must be your own (not
          borrowed from another site). Descriptions must include size,
          condition, and any material flaws. Misrepresentation is grounds
          for listing removal, refund, and account suspension.
        </p>
        <p>
          <strong>Authenticity.</strong> Counterfeit or replica items are
          strictly prohibited. Brand-name items require documentation on
          request. Repeated violations result in permanent account closure.
        </p>
        <p>
          <strong>Shipping.</strong> Sellers must ship within 3 business
          days of a completed sale, using the shipping label generated
          through Modaire. Failure to ship on time may trigger buyer refund
          and account penalties.
        </p>
        <p>
          <strong>Commission.</strong> Modaire charges a 15% commission on
          the gross sale price. Stripe payment-processing fees are
          additional. Both are deducted before payout.
        </p>
        <p>
          <strong>Payouts.</strong> Payouts are held for 3 days after
          delivery confirmation to allow buyer disputes to be raised. After
          the hold, funds are transferred to your Stripe Connect balance and
          subsequently to your bank on Stripe&apos;s standard payout schedule.
        </p>
        <p>
          <strong>Returns.</strong> Sellers must accept returns for items
          that are significantly not as described. Buyer&apos;s-remorse returns
          are not required for accurately described items.
        </p>
      </div>
    ),
  },
  {
    id: "refunds",
    label: "Return & Refund Policy",
    body: (
      <div className="space-y-4">
        <p>
          Modaire wants buyers to receive what they were promised. If an
          item is significantly not as described, we&apos;ll help make it right.
        </p>
        <p>
          <strong>When you may request a return.</strong> Within 3 days of
          delivery, you may open a return request if the item is
          significantly not as described — for example, wrong size relative
          to the listing, undisclosed damage, or a materially different
          color, brand, or material than pictured.
        </p>
        <p>
          <strong>How to request a return.</strong> Open a conversation with
          the seller from your order in your Modaire dashboard and explain
          the issue. Include photos showing the discrepancy.
        </p>
        <p>
          <strong>What is not eligible.</strong> Buyer&apos;s remorse (item
          doesn&apos;t fit your style, changed your mind) is not a valid return
          reason if the listing was accurate. Custom or made-to-order items
          may be non-returnable at the seller&apos;s discretion — this must be
          disclosed clearly in the listing.
        </p>
        <p>
          <strong>Mediation.</strong> If a return request is not resolved
          between buyer and seller within 48 hours, Modaire will mediate
          based on the listing content, delivered condition, and
          conversation history. Modaire&apos;s decision is final.
        </p>
        <p>
          <strong>Refund method.</strong> Approved refunds are issued
          through Stripe to the original payment method within 5–10
          business days. Return-shipping cost is generally the buyer&apos;s
          responsibility unless the item was misrepresented, in which case
          it falls on the seller.
        </p>
        <p>
          For help, contact{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="underline hover:text-[#5a4426]"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    ),
  },
];

export default function PoliciesPage() {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>(DEFAULT_OPEN_STATE);

  const resetScrollToTop = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const mainEl = document.querySelector("main");
    if (mainEl) {
      (mainEl as HTMLElement).scrollTop = 0;
    }
  };

  // If the URL has a fragment (#terms-sms, #privacy-sms, etc.), scroll
  // to that element instead of resetting to the top. This is critical
  // for the /signup opt-in flow — TCR reviewers deep-link into specific
  // subsections and expect to land there directly. Without this branch,
  // resetScrollToTop() would clobber the browser's native anchor scroll.
  const scrollToHashOrTop = () => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
    }
    resetScrollToTop();
  };

  useLayoutEffect(() => {
    // Run before paint AND on next frame for stable routing — some browsers
    // fire scroll restoration between these two, so we bracket it.
    scrollToHashOrTop();
    const raf = window.requestAnimationFrame(() => scrollToHashOrTop());
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // Re-open sections when browser restores this page from cache.
    const onPageShow = () => {
      setOpenItems(DEFAULT_OPEN_STATE);
      scrollToHashOrTop();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const toggleItem = (id: string) => {
    setOpenItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen bg-[#f4efea]" style={{ fontFamily: "var(--font-sans), sans-serif" }}>
      <div className="mx-auto w-full max-w-[860px] border-y border-[#ddd3cb] bg-[#f4efea] px-6 py-6 sm:px-8">
        <div className="space-y-4">
          {policyItems.map((item) => {
            const isOpen = !!openItems[item.id];
            return (
              <section key={item.id} id={item.id} className="scroll-mt-6 overflow-hidden rounded-[22px] border border-[#d9cfc7] bg-[#f4efea]">
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <span className="text-[17px] font-normal text-[#2f2925]">{item.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#9a7f6b]" strokeWidth={1.65} />
                </button>
                {isOpen ? (
                  <div className="px-6 pb-6 text-[15px] leading-[1.5] text-[#8f7f72]">
                    {typeof item.body === "string" ? (
                      <p>{item.body}</p>
                    ) : (
                      item.body
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
