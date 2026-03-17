"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Heart, MoreHorizontal, ShoppingBag } from "lucide-react";

type MobileOrderItem = {
    id: string;
    listing_id: string;
    amount: string | number;
    created_at: string;
    status: "Processing" | "Completed" | "Pending" | "Dispute Open";
    tab: "Active Orders" | "Completed" | "Pending" | "Disputes / Refunds";
    listing: {
        image_url: string;
        title: string;
        description: string;
        user: {
            first_name: string;
            last_name: string;
        };
    };
};

const orderTabs = ["Active Orders", "Completed", "Pending", "Disputes / Refunds"] as const;

export default function MobileOrdersClient({ orders }: { orders: MobileOrderItem[] }) {
    const [activeTab, setActiveTab] = useState<(typeof orderTabs)[number]>("Active Orders");

    const filtered = useMemo(() => orders.filter((order) => order.tab === activeTab), [orders, activeTab]);

    return (
        <div className="min-h-[100dvh] bg-[#f7f3ef] px-4 pb-28 pt-4 sm:hidden flex flex-col">
            <div className="mb-4 border-b border-border/80 pb-1.5">
                <div
                    className="scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    style={{
                        overflowX: "auto",
                        overflowY: "hidden",
                        WebkitOverflowScrolling: "touch",
                        touchAction: "pan-x",
                        overscrollBehaviorX: "contain",
                    }}
                >
                    <div className="inline-flex min-w-max items-center gap-5 pr-6">
                    {orderTabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`relative shrink-0 whitespace-nowrap py-2 text-[1.08rem] leading-none ${activeTab === tab ? "font-semibold text-foreground" : "text-foreground/80"}`}
                        >
                            {tab}
                            {activeTab === tab ? <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-[#5f4437]" /> : null}
                        </button>
                    ))}
                    </div>
                </div>
            </div>

            <h2 className="mb-4 font-serif text-4xl leading-none text-foreground">{activeTab}</h2>

            {filtered.length === 0 ? (
                <div className="flex flex-1 items-center">
                    <div className="w-full rounded-[1.25rem] border border-dashed border-border bg-card/80 px-5 py-12 text-center">
                        <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
                        <p className="text-base text-muted-foreground">No orders in this tab yet.</p>
                        <Link
                            href="/browse"
                            className="mt-4 inline-flex items-center rounded-full bg-[#5f4437] px-4 py-2 text-sm text-white"
                        >
                            Explore marketplace
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="divide-y divide-border/60">
                    {filtered.map((order) => {
                        const statusClass =
                            order.status === "Processing"
                                ? "bg-[#eadfd2] text-foreground"
                                : order.status === "Completed"
                                    ? "bg-[#dde4d2] text-foreground"
                                    : order.status === "Pending"
                                        ? "bg-[#efe3d7] text-foreground"
                                        : "bg-[#b5915f] text-white";

                        return (
                            <article key={order.id} className="py-3">
                                <div className="grid grid-cols-[112px_1fr] gap-3">
                                    <Link href={`/listings/${order.listing_id}`} className="relative overflow-hidden rounded-[0.8rem]">
                                        <div className="relative aspect-[3/4]">
                                            <Image src={order.listing.image_url} alt={order.listing.title} fill className="object-cover object-top" sizes="120px" />
                                        </div>
                                        <div className="absolute right-2 top-2 rounded-full bg-white/85 p-1">
                                            <Heart className="h-4 w-4 text-foreground" />
                                        </div>
                                    </Link>

                                    <div className="min-w-0">
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <span className={`rounded-md px-2 py-1 text-xs ${statusClass}`}>{order.status}</span>
                                            <MoreHorizontal className="h-5 w-5 text-foreground/70" />
                                        </div>
                                        <p className="line-clamp-1 text-4xl leading-none text-foreground">{order.listing.user.first_name} {order.listing.user.last_name}</p>
                                        <p className="mt-1 line-clamp-2 text-base leading-6 text-foreground/85">{order.listing.title}</p>
                                        <p className="mt-1 text-3xl leading-none text-foreground">${Number(order.amount).toLocaleString()}</p>
                                        <p className="mt-2 text-[0.95rem] text-muted-foreground">
                                            Order date: {new Date(order.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                                        </p>
                                        <p className="text-[0.95rem] text-muted-foreground">
                                            Order number: #{order.id.slice(0, 5).toUpperCase()}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center gap-5 pt-2 text-[1.02rem] text-foreground">
                                    <button type="button" className="text-left">Track Package</button>
                                    <button type="button" className="text-left">Contact Seller</button>
                                    <button type="button" aria-label="More actions" className="ml-auto">
                                        <MoreHorizontal className="h-5 w-5 text-foreground/70" />
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
