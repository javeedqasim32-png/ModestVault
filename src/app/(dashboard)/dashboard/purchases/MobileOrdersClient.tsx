"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Heart, MoreHorizontal, ShoppingBag } from "lucide-react";

type MobileOrderItem = {
    id: string;
    listing_id: string;
    stripe_session_id?: string | null;
    amount: string | number;
    created_at: string;
    status: string;
    tab: "Active Orders" | "Completed" | "Disputes / Refunds";
    tracking_number?: string | null;
    carrier?: string | null;
    shipping_stage?: string;
    has_shipping_address?: boolean;
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

const orderTabs = ["Active Orders", "Completed", "Disputes / Refunds"] as const;
const tabLabels: Record<(typeof orderTabs)[number], string> = {
    "Active Orders": "Active",
    "Completed": "Completed",
    "Disputes / Refunds": "Disputes",
};

export default function MobileOrdersClient({ orders }: { orders: MobileOrderItem[] }) {
    const [activeTab, setActiveTab] = useState<(typeof orderTabs)[number]>("Active Orders");

    const filtered = useMemo(() => orders.filter((order) => order.tab === activeTab), [orders, activeTab]);

    return (
        <div className="min-h-screen bg-[#f4efea] px-4 pb-28 pt-3 sm:hidden">
            <div className="mb-4 flex items-center justify-between border-y border-border/80 px-1 py-1.5">
                {orderTabs.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`relative px-2 py-2 text-xl leading-none ${activeTab === tab ? "font-semibold text-foreground" : "text-foreground/75"}`}
                    >
                        {tabLabels[tab]}
                        {activeTab === tab ? (
                            <span className="absolute bottom-0 left-2 right-2 h-[3px] rounded-full bg-[#5f4437]" />
                        ) : null}
                    </button>
                ))}
            </div>

            <h2 className="mb-3 font-serif text-3xl leading-none text-foreground">{activeTab}</h2>

            {filtered.length === 0 ? (
                <div className="flex min-h-[50vh] items-center justify-center">
                    <div className="w-full rounded-[1.25rem] border border-dashed border-border bg-card/80 px-5 py-12 text-center">
                        <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
                        <p className="text-base text-muted-foreground">No orders in this tab yet.</p>
                        <Link
                            href="/browse"
                            className="mx-auto mt-4 inline-flex items-center rounded-full bg-[#5f4437] px-4 py-2 text-sm text-white"
                        >
                            Explore marketplace
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="divide-y divide-border/60">
                    {filtered.map((order) => {
                        const stage = order.shipping_stage || "ADDRESS_MISSING";
                        const canResumeBuyerShippingFlow =
                            (stage === "ADDRESS_MISSING" || stage === "ADDRESS_SET" || stage === "OPTION_SELECTED") &&
                            !order.tracking_number &&
                            !!order.stripe_session_id;
                        const completeShippingHref = `/buy/success?session_id=${order.stripe_session_id}&listingId=${order.listing_id}`;
                        const statusClass =
                            order.status === "DELIVERED"
                                ? "bg-green-100 text-green-700"
                                : order.status === "CANCELLED" || order.status === "RETURNED"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-blue-100 text-blue-700";

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
                                            Order ID: #{order.id.slice(0, 5).toUpperCase()}
                                        </p>
                                        {(order.tracking_number || order.carrier) && (
                                            <p className="text-[0.95rem] font-medium text-foreground mt-1">
                                                {order.carrier ? `${order.carrier} ` : ""}Tracking: {order.tracking_number || "Pending"}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center gap-5 pt-2 text-[1.02rem] text-foreground">
                                    {canResumeBuyerShippingFlow ? (
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Link
                                                href={completeShippingHref}
                                                className="text-left font-medium text-primary hover:underline"
                                            >
                                                {stage === "ADDRESS_MISSING"
                                                    ? "Complete Shipping Details"
                                                    : stage === "ADDRESS_SET"
                                                        ? "Select Shipping Option"
                                                        : "Finalize Shipping Label"}
                                            </Link>
                                            {(stage === "ADDRESS_SET" || stage === "OPTION_SELECTED") ? (
                                                <Link href={`${completeShippingHref}&edit=1`} className="text-left font-medium text-muted-foreground hover:underline">
                                                    Edit Shipping Details
                                                </Link>
                                            ) : null}
                                        </div>
                                    ) : order.tracking_number ? (
                                        <a
                                            href={order.carrier === "USPS"
                                                ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.tracking_number}`
                                                : `https://google.com/search?q=${order.carrier}+tracking+${order.tracking_number}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-left font-medium hover:text-primary transition-colors"
                                        >
                                            Track Package
                                        </a>
                                    ) : (
                                        <button type="button" className="text-left opacity-50 cursor-not-allowed" disabled>Track Package</button>
                                    )}
                                    <button type="button" className="text-left font-medium hover:text-primary transition-colors">Contact Seller</button>
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
