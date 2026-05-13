"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

const DEFAULT_OPEN_STATE: Record<string, boolean> = {
  terms: false,
  privacy: false,
  seller: false,
  refunds: false,
};

const policyItems = [
  {
    id: "terms",
    label: "Terms of Service",
    body: "By using Modaire, you agree to list only authentic items, provide accurate descriptions and photos, and complete transactions in good faith. Misrepresentation, fraud, or harassment may result in permanent suspension.",
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    body: "We collect your name, email and usage data to operate the marketplace. We never sell your data. Payment information is handled by Stripe and never stored on our servers. You may request account deletion at any time.",
  },
  {
    id: "seller",
    label: "Seller Policy",
    body: "Sellers are responsible for item accuracy, shipping within 3 business days, and accepting returns for items significantly not as described. Modaire charges 10% commission on completed sales via Stripe Connect.",
  },
  {
    id: "refunds",
    label: "Return & Refund Policy",
    body: "Buyers may open a return request within 3 days of receiving an item if it is significantly not as described. If unresolved after 48 hours, Modaire will mediate. Items accurately described are non-refundable under buyer's remorse.",
  },
] as const;

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

  useLayoutEffect(() => {
    // Reset before paint and once again on next frame for stable routing.
    resetScrollToTop();
    const raf = window.requestAnimationFrame(() => resetScrollToTop());
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // Re-open sections when browser restores this page from cache.
    const onPageShow = () => {
      setOpenItems(DEFAULT_OPEN_STATE);
      resetScrollToTop();
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
        <h1
          id="policies-top"
          className="mb-6 text-[24px] leading-none text-[#2f2925] sm:text-[28px]"
          style={{ fontFamily: "var(--font-serif), serif", fontWeight: 400 }}
        >
          Policies & Terms
        </h1>
        <div className="space-y-4">
          {policyItems.map((item) => {
            const isOpen = !!openItems[item.id];
            return (
              <section key={item.id} className="overflow-hidden rounded-[22px] border border-[#d9cfc7] bg-[#f4efea]">
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <span className="text-[17px] font-normal text-[#2f2925]">{item.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#9a7f6b]" strokeWidth={1.65} />
                </button>
                {isOpen ? (
                  <div className="px-6 pb-6">
                    <p className="text-[15px] leading-[1.5] text-[#8f7f72]">{item.body}</p>
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
