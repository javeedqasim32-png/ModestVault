"use client";

import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { useMemo, useState } from "react";
import { ChevronRight, ShoppingBag } from "lucide-react";

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
        category?: string | null;
        user: {
            id?: string;
            first_name: string;
            last_name: string;
        };
    };
};

const tabs = ["ALL", "ACTIVE", "COMPLETED", "PENDING", "DISPUTES", "ANALYTICS"] as const;
type OrdersTab = (typeof tabs)[number];

const cormorantHeading = localFont({
    src: [
        { path: "../../../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
        { path: "../../../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
    ],
    display: "swap",
});

const tabLabel: Record<OrdersTab, string> = {
    ALL: "All",
    ACTIVE: "Active",
    COMPLETED: "Completed",
    PENDING: "Pending",
    DISPUTES: "Disputes",
    ANALYTICS: "Analytics",
};

function isDelivered(order: MobileOrderItem) {
    return normalizeOrderStatus(order.status) === "DELIVERED";
}

function isDispute(order: MobileOrderItem) {
    const status = normalizeOrderStatus(order.status);
    return status === "CANCELLED" || status === "RETURNED";
}

function isPending(order: MobileOrderItem) {
    const status = normalizeOrderStatus(order.status);
    return status === "PROCESSING" || status === "PENDING" || status === "NOT_SHIPPED";
}

function isActive(order: MobileOrderItem) {
    return !isDelivered(order) && !isDispute(order);
}

function formatMoney(amount: number) {
    return `$${Math.round(amount).toLocaleString()}`;
}

function normalizeOrderStatus(status: string) {
    return (status || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");
}

function getOrderLabel(id: string) {
    const short = id.replace(/-/g, "").slice(0, 4).toUpperCase();
    return `ORDER #MOD-${short}`;
}

function getTrackingUrl(order: MobileOrderItem) {
    if (!order.tracking_number) return null;
    if (order.carrier === "USPS") {
        return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.tracking_number}`;
    }
    return `https://google.com/search?q=${encodeURIComponent(`${order.carrier || "carrier"} tracking ${order.tracking_number}`)}`;
}

function getOrderStatusLabel(order: MobileOrderItem) {
    const status = normalizeOrderStatus(order.status);
    if (status === "DELIVERED") return "Delivered";
    if (status === "SHIPPED") return "Shipped";
    if (status === "NOT_SHIPPED" || status === "PENDING") return "Processing";
    if (status === "PROCESSING") return "Waiting Shipment";
    if (status === "CANCELLED") return "Cancelled";
    if (status === "RETURNED") return "Returned";
    return order.status
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getOrderStatusTone(order: MobileOrderItem) {
    const status = normalizeOrderStatus(order.status);
    if (status === "DELIVERED") return "bg-[#dff3e5] text-[#1f7a45] border-[#bfe3cc]";
    if (status === "SHIPPED") return "bg-[#e8f0fb] text-[#2f5f9a] border-[#cdddf2]";
    if (status === "PROCESSING") return "bg-[#efe9ff] text-[#5b46a1] border-[#ddd1fb]";
    if (status === "NOT_SHIPPED" || status === "PENDING") return "bg-[#fff4e5] text-[#8a6a46] border-[#f0dec4]";
    if (status === "CANCELLED" || status === "RETURNED") return "bg-[#fdecec] text-[#9a3a3a] border-[#f4c8c8]";
    return "bg-[#f3eee9] text-[#5f4a3c] border-[#ddd3cb]";
}

function formatCategoryLabel(value: string) {
    return value
        .toLowerCase()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export default function MobileOrdersClient({ orders }: { orders: MobileOrderItem[] }) {
    const [activeTab, setActiveTab] = useState<OrdersTab>("ALL");

    const filtered = useMemo(() => {
        if (activeTab === "ALL") return orders;
        if (activeTab === "ACTIVE") return orders.filter(isActive);
        if (activeTab === "COMPLETED") return orders.filter(isDelivered);
        if (activeTab === "PENDING") return orders.filter(isPending);
        if (activeTab === "DISPUTES") return orders.filter(isDispute);
        return [];
    }, [orders, activeTab]);

    const analytics = useMemo(() => {
        const totalSpent = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
        const orderCount = orders.length;
        const avgOrder = orderCount > 0 ? totalSpent / orderCount : 0;

        const completed = orders.filter(isDelivered);
        const completedSpend = completed.reduce((sum, order) => sum + Number(order.amount || 0), 0);

        const byCategory = new Map<string, number>();
        for (const order of orders) {
            const category = (order.listing.category || "Other").trim() || "Other";
            byCategory.set(category, (byCategory.get(category) || 0) + Number(order.amount || 0));
        }

        const categoryRows = [...byCategory.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
            .map(([name, value]) => ({ name, value }));

        const maxCategoryValue = categoryRows.length > 0 ? Math.max(...categoryRows.map((item) => item.value)) : 0;

        const bySeller = new Map<string, { sellerId: string | null; name: string; orders: number; total: number }>();
        for (const order of orders) {
            const first = (order.listing.user.first_name || "").trim();
            const last = (order.listing.user.last_name || "").trim();
            const sellerName = `${first} ${last}`.trim() || "Unknown Seller";
            const sellerId = order.listing.user.id ?? null;
            const key = sellerId || sellerName.toLowerCase();
            const existing = bySeller.get(key);
            if (existing) {
                existing.orders += 1;
                existing.total += Number(order.amount || 0);
            } else {
                bySeller.set(key, {
                    sellerId,
                    name: sellerName,
                    orders: 1,
                    total: Number(order.amount || 0),
                });
            }
        }

        const topSellers = [...bySeller.values()]
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);

        return {
            totalSpent,
            orderCount,
            avgOrder,
            savedEstimate: completedSpend * 0.22,
            categoryRows,
            maxCategoryValue,
            topSellers,
        };
    }, [orders]);

    const avatarTones = ["#d7bea1", "#c5b0d9", "#d9b8b8"] as const;

    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f4efea] pb-24 pt-4 sm:hidden">
            <div className="px-4">
                <Link
                    href="/cart"
                    className="mb-3 flex w-full items-center justify-between gap-3 rounded-[1.65rem] border border-[#ddd3cb] bg-[#fbf8f5] px-5 py-4 text-left"
                >
                    <div>
                        <p className={`${cormorantHeading.className} text-[23px] font-semibold leading-[1.05] text-foreground`}>Your Bag</p>
                        <p className="mt-1.5 text-[0.92rem] leading-[1.25] text-[#8a7667]">0 items · Tap to start shopping</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-[#8a7667]" />
                </Link>
            </div>

            <div className="max-w-full overflow-x-auto overflow-y-hidden border-b border-[#ddd3cb] bg-[#f7f2ed] pl-4 pr-4 [touch-action:pan-x] [-webkit-overflow-scrolling:touch]">
                <div className="inline-flex min-w-max items-center gap-4 pt-2.5">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`relative whitespace-nowrap pb-2 text-[0.88rem] ${
                                activeTab === tab ? "font-semibold text-[#2f2925]" : "font-normal text-[#8a7667]"
                            }`}
                        >
                            {tabLabel[tab]}
                            {activeTab === tab ? (
                                <span className="pointer-events-none absolute bottom-0 left-[8px] right-[8px] h-[2px] rounded-full bg-[#4a3328]" />
                            ) : null}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === "ANALYTICS" ? (
                <div className="px-4 pb-6 pt-4">
                    <h3 className={`${cormorantHeading.className} mb-4 text-[23px] font-medium leading-[1.05] text-[#2f2925]`}>
                        Purchase Analytics
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Total Spent</p>
                            <p className={`${cormorantHeading.className} mt-1.5 text-[2rem] leading-none text-[#2f2925]`}>{formatMoney(analytics.totalSpent)}</p>
                            <p className="mt-1 text-[0.88rem] text-[#8a7667]">All orders</p>
                        </div>
                        <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Orders</p>
                            <p className={`${cormorantHeading.className} mt-1.5 text-[2rem] leading-none text-[#2f2925]`}>{analytics.orderCount}</p>
                            <p className="mt-1 text-[0.88rem] text-[#8a7667]">All time</p>
                        </div>
                        <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Avg Order</p>
                            <p className={`${cormorantHeading.className} mt-1.5 text-[2rem] leading-none text-[#2f2925]`}>{formatMoney(analytics.avgOrder)}</p>
                            <p className="mt-1 text-[0.88rem] text-[#8a7667]">Per purchase</p>
                        </div>
                        <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Saved</p>
                            <p className={`${cormorantHeading.className} mt-1.5 text-[2rem] leading-none text-[#2f2925]`}>{formatMoney(analytics.savedEstimate)}</p>
                            <p className="mt-1 text-[0.88rem] text-[#8a7667]">vs retail est.</p>
                        </div>
                    </div>

                    <div className="mt-3 rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[14px]">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Spend by category</p>
                        <div className="mt-3 space-y-3">
                            {analytics.categoryRows.length === 0 ? (
                                <p className="text-[0.92rem] text-[#8a7667]">No orders yet.</p>
                            ) : (
                                analytics.categoryRows.map((row) => {
                                    const widthPct = analytics.maxCategoryValue > 0 ? (row.value / analytics.maxCategoryValue) * 100 : 0;
                                    return (
                                        <div key={row.name} className="grid grid-cols-[95px_1fr_58px] items-center gap-2.5">
                                            <p className="truncate text-[0.92rem] text-[#5f4a3c]">{formatCategoryLabel(row.name)}</p>
                                            <div className="h-3 rounded-full bg-[#dfd4ca]">
                                                <div
                                                    className="h-3 rounded-full bg-[#5f4437]"
                                                    style={{ width: `${Math.max(8, widthPct)}%` }}
                                                />
                                            </div>
                                            <p className="text-right text-[0.92rem] text-[#8a7667]">{formatMoney(row.value)}</p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="mt-3 rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[14px]">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Top sellers purchased from</p>
                        <div className="mt-3 space-y-4">
                            {analytics.topSellers.length === 0 ? (
                                <p className="text-[0.92rem] text-[#8a7667]">No seller purchases yet.</p>
                            ) : (
                                analytics.topSellers.map((seller, index) => {
                                    const firstInitial = seller.name.charAt(0).toUpperCase();
                                    const tone = avatarTones[index % avatarTones.length];
                                    const meta = `${seller.orders} ${seller.orders === 1 ? "order" : "orders"} · ${formatMoney(seller.total)}`;

                                    const rowContent = (
                                        <>
                                            <div
                                                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#ddd3cb]"
                                                style={{ backgroundColor: tone }}
                                            >
                                                <span className={`${cormorantHeading.className} text-[1.9rem] leading-none text-[#7f6352]`}>{firstInitial}</span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[0.95rem] font-semibold leading-[1.2] text-[#2f2925]">{seller.name}</p>
                                                <p className="mt-0.5 text-[0.92rem] text-[#8a7667]">{meta}</p>
                                            </div>
                                            <ChevronRight className="h-5 w-5 shrink-0 text-[#8a7667]" />
                                        </>
                                    );

                                    return seller.sellerId ? (
                                        <Link
                                            key={`${seller.sellerId}-${index}`}
                                            href={`/sellers/${seller.sellerId}`}
                                            className="flex items-center gap-3 rounded-[1rem] px-1 py-1"
                                        >
                                            {rowContent}
                                        </Link>
                                    ) : (
                                        <div key={`${seller.name}-${index}`} className="flex items-center gap-3 rounded-[1rem] px-1 py-1">
                                            {rowContent}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-3 px-4 pt-4">
                    {filtered.length === 0 ? (
                        <div className="rounded-[1.25rem] border border-[#ddd3cb] bg-[#fbf8f5] px-5 py-8 text-center">
                            <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-[#8a7667]/50" />
                            <p className="text-base text-[#8a7667]">No orders in this tab yet.</p>
                            <Link
                                href="/browse"
                                className="mx-auto mt-4 inline-flex items-center rounded-full bg-[#5f4437] px-4 py-2 text-sm text-white"
                            >
                                Explore marketplace
                            </Link>
                        </div>
                    ) : (
                        filtered.map((order) => (
                            <article key={order.id} className="rounded-[1.45rem] border border-[#ddd3cb] bg-[#fbf8f5] p-3.5">
                                <div className="grid grid-cols-[96px_1fr] gap-3">
                                    <Link href={`/listings/${order.listing_id}`} className="relative overflow-hidden rounded-[1.05rem] border border-[#e3d8cf] bg-[#f2ebe4]">
                                        <div className="relative aspect-[2/3]">
                                            <Image src={order.listing.image_url} alt={order.listing.title} fill className="object-cover object-top" sizes="110px" />
                                        </div>
                                    </Link>

                                    <div className="min-w-0">
                                        <p className="text-[0.76rem] uppercase tracking-[0.15em] text-[#8a7667]">{getOrderLabel(order.id)}</p>
                                        <Link href={`/listings/${order.listing_id}`} className="mt-1 block line-clamp-2 text-[1.05rem] font-semibold text-[#2f2925]">
                                            {order.listing.title}
                                        </Link>
                                        <p className="mt-1 text-[0.86rem] text-[#8a7667]">
                                            {order.listing.user.first_name} {order.listing.user.last_name}
                                        </p>

                                        <div className="mt-2 flex items-center gap-2">
                                            <p className="text-[0.98rem] font-semibold leading-none text-[#2f2925]">
                                                ${Number(order.amount).toLocaleString()}
                                            </p>
                                            <span
                                                className={`inline-flex rounded-full border px-3 py-[3px] text-[0.8rem] font-semibold ${getOrderStatusTone(order)}`}
                                            >
                                                {getOrderStatusLabel(order)}
                                            </span>
                                        </div>

                                        <p className="mt-2 text-[0.86rem] text-[#8a7667]">
                                            {new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-2.5 flex flex-wrap gap-2 pl-[99px]">
                                    {getTrackingUrl(order) ? (
                                        <a
                                            href={getTrackingUrl(order)!}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex h-8 items-center rounded-full border border-[#d7cdc4] bg-white px-3.5 text-[0.84rem] font-medium text-[#5f4a3c]"
                                        >
                                            Track Order
                                        </a>
                                    ) : (
                                        <span className="inline-flex h-8 items-center rounded-full border border-[#e1d8d0] bg-[#f6f1eb] px-3.5 text-[0.84rem] text-[#a08979]">
                                            Track Order
                                        </span>
                                    )}

                                    {order.listing.user.id ? (
                                        <Link
                                            href={`/messages/start?sellerId=${order.listing.user.id}&listingId=${order.listing_id}`}
                                            className="inline-flex h-8 items-center rounded-full border border-[#d7cdc4] bg-white px-3.5 text-[0.84rem] font-medium text-[#5f4a3c]"
                                        >
                                            Message Seller
                                        </Link>
                                    ) : (
                                        <span className="inline-flex h-8 items-center rounded-full border border-[#e1d8d0] bg-[#f6f1eb] px-3.5 text-[0.84rem] text-[#a08979]">
                                            Message Seller
                                        </span>
                                    )}
                                </div>
                            </article>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
