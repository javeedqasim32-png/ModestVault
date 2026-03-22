"use client";

import { useState } from "react";
import { approveListing, rejectListing } from "@/app/actions/admin";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type AdminListing = {
    id: string;
    title: string;
    price: number;
    style: string;
    category: string;
    subcategory: string | null;
    type: string | null;
    status: string;
    moderation_status: string;
    image_url: string;
    sellerName: string;
    created_at: string;
    rejection_reason: string | null;
};

export default function AdminListingsClient({ initialListings }: { initialListings: AdminListing[] }) {
    const [listings, setListings] = useState<AdminListing[]>(initialListings);
    const [activeTab, setActiveTab] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");
    const [processingId, setProcessingId] = useState<string | null>(null);

    const filteredListings = listings.filter(l => l.moderation_status === activeTab);

    async function handleApprove(id: string) {
        setProcessingId(id);
        const res = await approveListing(id);
        if (res.success) {
            setListings(prev => prev.map(l => l.id === id ? { ...l, moderation_status: "APPROVED" } : l));
        }
        setProcessingId(null);
    }

    async function handleReject(id: string) {
        const reason = window.prompt("Rejection reason (optional):");
        if (reason === null) return; // User cancelled prompt

        setProcessingId(id);
        const res = await rejectListing(id, reason);
        if (res.success) {
            setListings(prev => prev.map(l => l.id === id ? { ...l, moderation_status: "REJECTED", rejection_reason: reason } : l));
        }
        setProcessingId(null);
    }

    return (
        <div className="space-y-6">
            <div className="flex gap-2 p-1 border border-border/80 rounded-lg w-max bg-card/60">
                {(["PENDING", "APPROVED", "REJECTED"] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        {tab} ({listings.filter(l => l.moderation_status === tab).length})
                    </button>
                ))}
            </div>

            <div className="bg-card border border-border/80 rounded-[1.25rem] overflow-hidden shadow-sm">
                {filteredListings.length === 0 ? (
                    <div className="p-10 text-center text-muted-foreground">
                        No {activeTab.toLowerCase()} listings found.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Item</th>
                                    <th className="px-6 py-4 font-medium">Seller</th>
                                    <th className="px-6 py-4 font-medium">Taxonomy / Price</th>
                                    <th className="px-6 py-4 font-medium">Date</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {filteredListings.map(listing => (
                                    <tr key={listing.id} className="hover:bg-muted/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-16 relative rounded-md overflow-hidden bg-muted flex-shrink-0">
                                                    <Image src={listing.image_url} alt={listing.title} fill className="object-cover" />
                                                </div>
                                                <div className="font-medium text-foreground line-clamp-2 max-w-[200px]">
                                                    {listing.title}
                                                    {listing.status === "SOLD" && (
                                                        <Badge variant="secondary" className="block w-max mt-1 text-[10px]">SOLD</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-foreground">{listing.sellerName}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-foreground">{listing.style}</div>
                                            <div className="text-foreground">{listing.category}</div>
                                            {listing.subcategory ? (
                                                <div className="text-xs text-muted-foreground">{listing.subcategory}{listing.type ? ` • ${listing.type}` : ""}</div>
                                            ) : null}
                                            <div className="font-medium mt-1">${listing.price}</div>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                                            {new Date(listing.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-end gap-2">
                                                {listing.moderation_status !== "APPROVED" && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleApprove(listing.id)}
                                                        disabled={processingId === listing.id}
                                                    >
                                                        Approve
                                                    </Button>
                                                )}
                                                {listing.moderation_status !== "REJECTED" && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleReject(listing.id)}
                                                        disabled={processingId === listing.id}
                                                        className="border-destructive/30 text-destructive hover:bg-destructive/10"
                                                    >
                                                        Reject
                                                    </Button>
                                                )}
                                                {listing.moderation_status === "REJECTED" && listing.rejection_reason && (
                                                    <div className="text-xs text-destructive max-w-[150px] text-right break-words mt-1">
                                                        Reason: {listing.rejection_reason}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
