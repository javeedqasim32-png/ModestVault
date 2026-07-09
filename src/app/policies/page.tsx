"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

const DEFAULT_OPEN_STATE: Record<string, boolean> = {
  terms: false,
  privacy: false,
  seller: false,
  refunds: false,
};

const SUPPORT_EMAIL = "support@shopmodaire.com";

type PolicyItem = {
  id: string;
  label: string;
  body: ReactNode;
};

const policyItems: readonly PolicyItem[] = [
  {
    id: "terms",
    label: "Terms of Service",
    body: "By using Modaire, you agree to list only authentic items, provide accurate descriptions and photos, and complete transactions in good faith. Misrepresentation, fraud, or harassment may result in permanent suspension.",
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    body: (
      <div className="space-y-4">
        <p>
          We collect your name, email and usage data to operate the marketplace.
          We never sell your data. Payment information is handled by Stripe and
          never stored on our servers. You may request account deletion at any
          time.
        </p>
        <div className="pt-2 border-t border-[#d9cfc7]/60">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647] mb-3">
            SMS / Text Messaging
          </p>
          <div className="space-y-3">
            <p>
              Modaire may collect your mobile phone number when you create an
              account, update your profile, or choose to receive text message
              alerts.
            </p>
            <p>
              If you opt in, Modaire may send you SMS/text messages related to
              your account activity, including alerts about unread
              buyer/seller messages, marketplace communication, account
              updates, and other service-related notifications.
            </p>
            <p>
              Message frequency may vary. Message and data rates may apply.
              You can opt out of SMS messages at any time by replying{" "}
              <strong>STOP</strong> to any message. You may also contact us at{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="underline hover:text-[#5a4426]"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              for help.
            </p>
            <p>
              Modaire does not sell, rent, or share your mobile phone number
              with third parties or affiliates for marketing or promotional
              purposes.
            </p>
            <p>
              Text messaging originator opt-in data and consent will not be
              shared with any third parties, except as needed to provide SMS
              messaging services, comply with law, or protect the rights,
              safety, and security of Modaire, our users, or others.
            </p>
            <p>
              Your decision to opt in to SMS messages is optional and is not
              required to use Modaire or make a purchase.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "seller",
    label: "Seller Policy",
    body: "Sellers are responsible for item accuracy, shipping within 3 business days, and accepting returns for items significantly not as described. Modaire charges 15% commission on completed sales via Stripe Connect.",
  },
  {
    id: "refunds",
    label: "Return & Refund Policy",
    body: "Buyers may open a return request within 3 days of receiving an item if it is significantly not as described. If unresolved after 48 hours, Modaire will mediate. Items accurately described are non-refundable under buyer's remorse.",
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
