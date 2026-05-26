"use client";

import React, { useState } from "react";
import { approveListing, rejectListing, updateListingImagesOrder } from "@/app/actions/admin";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type ListingImage = {
    id: string;
    imageUrl: string;
    thumbUrl: string | null;
    mediumUrl: string | null;
    imageOrder: number;
};

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
    images: ListingImage[];
};

export default function AdminListingsClient({ initialListings }: { initialListings: AdminListing[] }) {
    const [listings, setListings] = useState<AdminListing[]>(initialListings);
    const [activeTab, setActiveTab] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [expandedListingId, setExpandedListingId] = useState<string | null>(null);
    const [savingImagesId, setSavingImagesId] = useState<string | null>(null);

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

    async function handleMoveImage(listingId: string, imageId: string, direction: 'left' | 'right') {
        const listing = listings.find(l => l.id === listingId);
        if (!listing) return;

        const updatedImages = [...listing.images];
        const idx = updatedImages.findIndex(img => img.id === imageId);
        if (idx === -1) return;

        const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= updatedImages.length) return;

        // Swap the elements
        const temp = updatedImages[idx];
        updatedImages[idx] = updatedImages[targetIdx];
        updatedImages[targetIdx] = temp;

        // Optimistically update local state
        setListings(prev => prev.map(l => {
            if (l.id === listingId) {
                return {
                    ...l,
                    images: updatedImages,
                    image_url: updatedImages[0]?.mediumUrl || updatedImages[0]?.imageUrl || "/placeholder.svg"
                };
            }
            return l;
        }));

        setSavingImagesId(imageId);
        try {
            const res = await updateListingImagesOrder(listingId, updatedImages.map(img => img.id));
            if (!res.success) {
                alert("Failed to update image order on the server. Please try again.");
            }
        } catch (err) {
            console.error("Failed to update image order:", err);
            alert("An error occurred while saving the image order.");
        } finally {
            setSavingImagesId(null);
        }
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
                                    <React.Fragment key={listing.id}>
                                        <tr className="hover:bg-muted/20 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-4">
                                                    <Link 
                                                        href={`/listings/${listing.id}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        title="Click to view listing page"
                                                        className="w-12 h-16 relative rounded-md overflow-hidden bg-muted flex-shrink-0 hover:opacity-80 transition-opacity border border-border/60 block"
                                                    >
                                                        <Image src={listing.image_url} alt={listing.title} fill className="object-cover" />
                                                    </Link>
                                                    <div className="font-medium text-foreground line-clamp-2 max-w-[200px]">
                                                        <div>{listing.title}</div>
                                                        {listing.status === "SOLD" && (
                                                            <Badge variant="secondary" className="block w-max mt-1 text-[10px]">SOLD</Badge>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedListingId(expandedListingId === listing.id ? null : listing.id)}
                                                            className="text-xs text-primary font-semibold hover:underline block mt-2 focus:outline-none"
                                                        >
                                                            {expandedListingId === listing.id ? "Close Gallery" : `Manage Images (${listing.images?.length ?? 0})`}
                                                        </button>
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
                                        {expandedListingId === listing.id && (
                                            <tr className="bg-muted/30">
                                                <td colSpan={5} className="px-6 py-5 border-t border-b border-border/50">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="text-sm font-semibold text-foreground font-serif">Rearrange Photos for &quot;{listing.title}&quot;</h4>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                Click the arrows below any image to move it. The first image is the primary cover displayed in feeds. All adjustments are saved instantly.
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-wrap gap-4 pt-1">
                                                            {listing.images?.map((img, index) => (
                                                                <div 
                                                                    key={img.id} 
                                                                    className={`relative w-[110px] bg-card rounded-xl border p-1.5 flex flex-col items-center justify-between transition-all shadow-sm ${index === 0 ? "border-primary/60 ring-1 ring-primary/10" : "border-border/80"}`}
                                                                >
                                                                    <div className="w-full aspect-[3/4] relative rounded-lg overflow-hidden bg-muted border border-border/40">
                                                                        <Image 
                                                                            src={img.mediumUrl || img.imageUrl} 
                                                                            alt={`Listing photo ${index + 1}`} 
                                                                            fill 
                                                                            className="object-cover" 
                                                                            sizes="110px"
                                                                        />
                                                                        {savingImagesId === img.id && (
                                                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                                                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                            </div>
                                                                        )}
                                                                        {index === 0 && (
                                                                            <span className="absolute left-1 top-1 bg-primary text-primary-foreground text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                                                                Cover
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex gap-1.5 w-full mt-2 justify-center">
                                                                        <button
                                                                            type="button"
                                                                            disabled={index === 0 || savingImagesId !== null}
                                                                            onClick={() => handleMoveImage(listing.id, img.id, 'left')}
                                                                            className="flex-1 py-1 rounded bg-muted hover:bg-muted/80 text-foreground disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold"
                                                                            aria-label="Move left"
                                                                        >
                                                                            ◀
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={index === (listing.images?.length ?? 1) - 1 || savingImagesId !== null}
                                                                            onClick={() => handleMoveImage(listing.id, img.id, 'right')}
                                                                            className="flex-1 py-1 rounded bg-muted hover:bg-muted/80 text-foreground disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold"
                                                                            aria-label="Move right"
                                                                        >
                                                                            ▶
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
