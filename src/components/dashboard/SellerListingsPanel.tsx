"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteListing } from "@/app/actions/listings";
import ListingCard from "@/components/marketplace/ListingCard";

type ListingItem = {
    id: string;
    image_url: string;
    title: string;
    description: string;
    price: string | number;
    category: string;
    condition?: string | null;
    status: string;
};

type SellerListingsPanelProps = {
    listings: ListingItem[];
};

const tabs = ["ALL", "ACTIVE", "SOLD", "PENDING"] as const;

export default function SellerListingsPanel({ listings }: SellerListingsPanelProps) {
    const router = useRouter();
    const [tab, setTab] = useState<(typeof tabs)[number]>("ALL");
    const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
    const [error, setError] = useState("");

    const filtered = useMemo(() => {
        if (tab === "ALL") return listings;
        if (tab === "ACTIVE") return listings.filter((listing) => listing.status === "AVAILABLE");
        if (tab === "SOLD") return listings.filter((listing) => listing.status === "SOLD");
        return listings.filter((listing) => listing.status === "PENDING");
    }, [listings, tab]);

    const handleDelete = async (listingId: string) => {
        const confirmed = window.confirm("Delete this listing? This also deletes its images from storage.");
        if (!confirmed) return;

        setError("");
        setDeletingListingId(listingId);
        try {
            const result = await deleteListing(listingId);
            if (result?.error) {
                setError(result.error);
                return;
            }
            router.refresh();
        } catch {
            setError("Failed to delete listing.");
        } finally {
            setDeletingListingId(null);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
                {tabs.map((item) => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => setTab(item)}
                        className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.24em] ${tab === item ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground"}`}
                    >
                        {item}
                    </button>
                ))}
            </div>
            {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            {filtered.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-border bg-background/60 px-5 py-12 text-center text-muted-foreground">
                    No listings in this tab yet.
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                    {filtered.map((listing, index) => (
                        <div key={listing.id} className="space-y-2">
                            <ListingCard
                                href={`/listings/${listing.id}`}
                                imageUrl={listing.image_url}
                                title={listing.title}
                                description={listing.description}
                                price={listing.price}
                                category={listing.category}
                                condition={listing.condition}
                                status={listing.status}
                                featured={index === 0}
                                compact
                                showFullImage
                            />
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => void handleDelete(listing.id)}
                                    disabled={deletingListingId === listing.id}
                                    className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50"
                                >
                                    {deletingListingId === listing.id ? "Deleting..." : "Delete listing"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
