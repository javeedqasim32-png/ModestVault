"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronRight, ShoppingBag, ShieldCheck, TrendingUp, X } from "lucide-react";
import { markWelcomeSeen } from "@/app/actions/welcome";

type Action = "sell" | "buy" | "dismiss";

const BENEFITS = [
    {
        icon: TrendingUp,
        iconBg: "#d6edd9",
        iconColor: "#2f9a43",
        title: "Keep 85% of every sale",
        body: "More earnings for you.",
    },
    {
        icon: ShoppingBag,
        iconBg: "#f3d3e2",
        iconColor: "#ce2f3b",
        title: "Start selling instantly",
        body: "List your items and reach buyers today.",
    },
    {
        icon: ShieldCheck,
        iconBg: "#e8d5f1",
        iconColor: "#7a2dc2",
        title: "Activate payouts after your first sale in Settings",
        body: "Connect payouts and get paid securely.",
    },
] as const;

export default function WelcomeModal() {
    const router = useRouter();
    const [open, setOpen] = useState(true);
    const [, startTransition] = useTransition();

    const handleAction = (action: Action) => {
        if (!open) return;
        setOpen(false);
        startTransition(async () => {
            await markWelcomeSeen();
            if (action === "sell") router.push("/sell?create=1");
            else if (action === "buy") router.push("/browse");
            // "dismiss" stays on the current page (home)
        });
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4 py-6"
            onClick={() => handleAction("dismiss")}
        >
            <div
                className="relative max-h-[92dvh] w-full max-w-[420px] overflow-y-auto rounded-[28px] bg-[#fbf7f1] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label="Close welcome"
                    onClick={() => handleAction("dismiss")}
                    className="absolute right-4 top-4 text-[#8a7667] hover:text-[#2f2925]"
                >
                    <X className="h-5 w-5" />
                </button>

                {/* Hero illustration — bag emoji wrap with 85% badge */}
                <div className="relative mx-auto mt-2 flex h-32 items-end justify-center">
                    <div className="text-7xl">🛍️</div>
                    <div className="absolute right-[28%] bottom-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#a07c61] text-[15px] font-semibold text-white shadow-md">
                        85%
                    </div>
                </div>

                <h2
                    className="mt-5 text-center text-[34px] font-medium leading-tight text-[#2f2925]"
                    style={{ fontFamily: "var(--font-serif), serif" }}
                >
                    You&apos;re all set!
                    <span className="ml-1 text-[#cfb79f]">✨</span>
                </h2>
                <p className="mt-2 text-center text-[15px] text-[#7a6050]">
                    Start buying and selling on Modaire.
                </p>

                <div className="mt-6 divide-y divide-[#e8ddd1] rounded-[20px] border border-[#e8ddd1] bg-[#fefcf8]">
                    {BENEFITS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <div key={item.title} className="flex items-start gap-3 p-4">
                                <div
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
                                    style={{ backgroundColor: item.iconBg }}
                                >
                                    <Icon className="h-5 w-5" style={{ color: item.iconColor, strokeWidth: 2.2 }} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[15px] font-semibold leading-tight text-[#2f2925]">{item.title}</p>
                                    <p className="mt-1 text-[13px] text-[#7a6050]">{item.body}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={() => handleAction("sell")}
                    className="mt-6 w-full rounded-full bg-[#5f4437] py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#4a3328]"
                >
                    Start Selling
                </button>
                <button
                    type="button"
                    onClick={() => handleAction("buy")}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1 text-[14px] font-medium text-[#5f4437] hover:opacity-80"
                >
                    Explore Items to Buy
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
