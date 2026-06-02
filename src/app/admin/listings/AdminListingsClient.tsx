"use client";

import React, { useEffect, useRef, useState } from "react";
import { approveListing, approveAndFeatureListing, partiallyApproveListing, rejectListing, setListingFeatured, updateListingImagesOrder } from "@/app/actions/admin";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChevronDown, Star, Check, X, AlertCircle, ImageIcon } from "lucide-react";

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
    is_featured: boolean;
    image_url: string;
    sellerName: string;
    created_at: string;
    rejection_reason: string | null;
    images: ListingImage[];
};

export default function AdminListingsClient({ initialListings }: { initialListings: AdminListing[] }) {
    const [listings, setListings] = useState<AdminListing[]>(initialListings);
    const [activeTab, setActiveTab] = useState<"PENDING" | "APPROVED" | "PARTIAL_APPROVED" | "REJECTED">("PENDING");
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [expandedListingId, setExpandedListingId] = useState<string | null>(null);
    const [savingImagesId, setSavingImagesId] = useState<string | null>(null);
    const [openActionsId, setOpenActionsId] = useState<string | null>(null);
    const actionsMenuRef = useRef<HTMLDivElement | null>(null);

    // Close the open Actions dropdown on outside click or Escape.
    useEffect(() => {
        if (!openActionsId) return;
        function handlePointer(event: MouseEvent) {
            if (!actionsMenuRef.current) return;
            if (!actionsMenuRef.current.contains(event.target as Node)) {
                setOpenActionsId(null);
            }
        }
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") setOpenActionsId(null);
        }
        document.addEventListener("mousedown", handlePointer);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handlePointer);
            document.removeEventListener("keydown", handleKey);
        };
    }, [openActionsId]);

    const filteredListings = listings.filter(l => l.moderation_status === activeTab);

    async function handleApprove(id: string) {
        setProcessingId(id);
        const res = await approveListing(id);
        if (res.success) {
            setListings(prev => prev.map(l => l.id === id ? { ...l, moderation_status: "APPROVED" } : l));
        }
        setProcessingId(null);
    }

    async function handlePartialApprove(id: string) {
        setProcessingId(id);
        const res = await partiallyApproveListing(id);
        if (res.success) {
            setListings(prev => prev.map(l => l.id === id ? { ...l, moderation_status: "PARTIAL_APPROVED" } : l));
        }
        setProcessingId(null);
    }

    async function handleApproveAndFeature(id: string) {
        setProcessingId(id);
        const res = await approveAndFeatureListing(id);
        if (res.success) {
            setListings(prev => prev.map(l => l.id === id ? { ...l, moderation_status: "APPROVED", is_featured: true } : l));
        }
        setProcessingId(null);
    }

    async function handleToggleFeatured(id: string, next: boolean) {
        setProcessingId(id);
        // Optimistic — flip immediately so the badge + button text update without waiting.
        setListings(prev => prev.map(l => l.id === id ? { ...l, is_featured: next } : l));
        const res = await setListingFeatured(id, next);
        if (!res.success) {
            // Rollback on failure.
            setListings(prev => prev.map(l => l.id === id ? { ...l, is_featured: !next } : l));
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
                {(["PENDING", "APPROVED", "PARTIAL_APPROVED", "REJECTED"] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        {tab === "PARTIAL_APPROVED" ? "PARTIAL" : tab} ({listings.filter(l => l.moderation_status === tab).length})
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
                                                    <div className="max-w-[200px] font-medium text-foreground">
                                                        <div className="line-clamp-2">{listing.title}</div>
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                            {/* Single status pill — color-coded by moderation_status + is_featured. */}
                                                            {(() => {
                                                                const mod = listing.moderation_status;
                                                                if (mod === "APPROVED" && listing.is_featured) {
                                                                    return (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                                                            <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Featured
                                                                        </span>
                                                                    );
                                                                }
                                                                if (mod === "APPROVED") {
                                                                    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Approved</span>;
                                                                }
                                                                if (mod === "PARTIAL_APPROVED") {
                                                                    return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-800">Partial</span>;
                                                                }
                                                                if (mod === "REJECTED") {
                                                                    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">Rejected</span>;
                                                                }
                                                                return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-800">Pending</span>;
                                                            })()}
                                                            {listing.status === "SOLD" && (
                                                                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-700">Sold</span>
                                                            )}
                                                        </div>
                                                        {listing.moderation_status === "REJECTED" && listing.rejection_reason && (
                                                            <p className="mt-1.5 text-xs text-destructive break-words">
                                                                Reason: {listing.rejection_reason}
                                                            </p>
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
                                                {/* Single Actions dropdown — replaces the prior stack of 3-5 buttons per row.
                                                    Menu items are filtered by current state so admins only see relevant actions. */}
                                                <div className="relative flex justify-end" ref={openActionsId === listing.id ? actionsMenuRef : undefined}>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setOpenActionsId(openActionsId === listing.id ? null : listing.id)}
                                                        disabled={processingId === listing.id}
                                                        className="gap-1"
                                                    >
                                                        Actions
                                                        <ChevronDown className="h-4 w-4" />
                                                    </Button>
                                                    {openActionsId === listing.id && (
                                                        <div
                                                            role="menu"
                                                            className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
                                                        >
                                                            {listing.moderation_status !== "APPROVED" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setOpenActionsId(null); handleApprove(listing.id); }}
                                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                                                                >
                                                                    <Check className="h-4 w-4 text-emerald-600" /> Approve
                                                                </button>
                                                            )}
                                                            {listing.moderation_status !== "APPROVED" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setOpenActionsId(null); handleApproveAndFeature(listing.id); }}
                                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                                                                >
                                                                    <Star className="h-4 w-4 text-amber-500" /> Approve &amp; Feature
                                                                </button>
                                                            )}
                                                            {listing.moderation_status === "APPROVED" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setOpenActionsId(null); handleToggleFeatured(listing.id, !listing.is_featured); }}
                                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                                                                >
                                                                    <Star className="h-4 w-4 text-amber-500" /> {listing.is_featured ? "Unfeature" : "Feature"}
                                                                </button>
                                                            )}
                                                            {listing.moderation_status !== "PARTIAL_APPROVED" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setOpenActionsId(null); handlePartialApprove(listing.id); }}
                                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                                                                >
                                                                    <AlertCircle className="h-4 w-4 text-orange-500" /> Partial Accept
                                                                </button>
                                                            )}
                                                            {listing.moderation_status !== "REJECTED" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setOpenActionsId(null); handleReject(listing.id); }}
                                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                                                                >
                                                                    <X className="h-4 w-4 text-destructive" /> Reject
                                                                </button>
                                                            )}
                                                            <div className="border-t border-border/60" />
                                                            <button
                                                                type="button"
                                                                onClick={() => { setOpenActionsId(null); setExpandedListingId(expandedListingId === listing.id ? null : listing.id); }}
                                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60"
                                                            >
                                                                <ImageIcon className="h-4 w-4" />
                                                                {expandedListingId === listing.id ? "Close Gallery" : `Manage Images (${listing.images?.length ?? 0})`}
                                                            </button>
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
