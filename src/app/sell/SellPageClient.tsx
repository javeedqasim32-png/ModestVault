"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createListing, deleteListing } from "../actions/listings";
import { onboardSellerAction } from "../actions/stripe";
import { Tag, UploadCloud, ChevronRight, CheckCircle2, CreditCard, Heart, PackagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useRouter } from "next/navigation";

type ListingItem = {
    id: string;
    title: string;
    description: string;
    price: number | string;
    image_url: string;
    status: string;
};

type SellPageClientProps = {
    isSellerInitially: boolean;
    listings: ListingItem[];
};

const tabs = ["LISTINGS", "SOLD", "ACTIVE", "PENDING"] as const;

export default function SellPageClient({ isSellerInitially, listings }: SellPageClientProps) {
    const router = useRouter();
    const [isSeller] = useState(isSellerInitially);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [mobileTab, setMobileTab] = useState<(typeof tabs)[number]>("LISTINGS");
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const filteredListings = useMemo(() => {
        if (mobileTab === "LISTINGS") return listings;
        if (mobileTab === "SOLD") return listings.filter((listing) => listing.status === "SOLD");
        if (mobileTab === "ACTIVE") return listings.filter((listing) => listing.status === "AVAILABLE");
        return listings.filter((listing) => listing.status === "PENDING");
    }, [listings, mobileTab]);

    async function handleStripeOnboarding() {
        setLoading(true);
        setError("");
        try {
            const res = await onboardSellerAction();
            if (res?.url) {
                window.location.href = res.url;
            } else {
                setError("Failed to generate onboarding link.");
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred during onboarding.");
        } finally {
            setLoading(false);
        }
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        setError(""); // Clear previous errors

        if (files.length === 0) {
            e.target.value = "";
            return;
        }

        const oversized = files.find((file) => file.size > 10 * 1024 * 1024);
        if (oversized) {
            setError("One or more images are larger than 10MB.");
            e.target.value = "";
            return;
        }

        const merged = [...selectedFiles];

        for (const file of files) {
            const duplicate = merged.some(
                (existing) =>
                    existing.name === file.name &&
                    existing.size === file.size &&
                    existing.lastModified === file.lastModified
            );
            if (!duplicate) {
                merged.push(file);
            }
        }

        if (merged.length > 6) {
            setError("You can upload a maximum of 6 images.");
            e.target.value = "";
            return;
        }

        setSelectedFiles(merged);
        e.target.value = "";
    };

    const removeImage = (indexToRemove: number) => {
        setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
    };

    useEffect(() => {
        const urls = selectedFiles.map((file) => URL.createObjectURL(file));
        setPreviewUrls(urls);
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [selectedFiles]);

    const handleDeleteListing = async (listingId: string) => {
        const confirmed = window.confirm("Delete this listing? This will remove it from your listings and delete its images.");
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

    const renderCreateForm = (showMobileBack: boolean) => (
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-border/80 bg-card p-5 shadow-[0_24px_60px_rgba(114,86,67,0.08)] sm:p-8">
            {showMobileBack ? (
                <div className="mb-5 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground"
                    >
                        Back
                    </button>
                    <p className="text-sm text-muted-foreground">New listing</p>
                </div>
            ) : null}
            <div className="mb-8 rounded-[1.75rem] bg-[linear-gradient(135deg,#f3e7de_0%,#ecdccf_55%,#e2cab9_100%)] p-6 sm:p-8">
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">List new item</p>
                <h1 className="mt-2 font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                    Create Listing
                </h1>
                <p className="text-muted-foreground">
                    Present your fashion pieces in their best light.
                </p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 text-sm p-4 border border-red-200 mb-8">
                    {error}
                </div>
            )}

            <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                setError("");
                try {
                    const formData = new FormData(e.currentTarget);
                    formData.delete("images");
                    if (selectedFiles.length === 0) {
                        setError("Please upload at least one image.");
                        setLoading(false);
                        return;
                    }
                    selectedFiles.forEach((file) => formData.append("images", file));
                    const res = await createListing(formData);
                    if (res?.error) {
                        setError(res.error);
                    }
                } catch {
                    setError("An unexpected error occurred.");
                } finally {
                    setLoading(false);
                }
            }} className="space-y-8">

                <section className="space-y-4">
                    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Product Photos (Up to 6)
                    </h2>

                    <div className="relative w-full overflow-hidden rounded-[1.75rem] border border-dashed border-border bg-muted/20 min-h-[280px]">
                        {previewUrls.length > 0 ? (
                            <div className="w-full p-3 sm:p-4">
                                <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3">
                                    {previewUrls.map((previewUrl, index) => (
                                        <div key={`${previewUrl}-${index}`} className="relative overflow-hidden rounded-lg border border-border/70 bg-card">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={previewUrl}
                                                alt={`Preview ${index + 1}`}
                                                className="aspect-square w-full object-contain bg-muted/40"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeImage(index)}
                                                aria-label={`Remove image ${index + 1}`}
                                                className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-2 flex items-center justify-between px-2 pb-2">
                                    <p className="text-xs text-muted-foreground">
                                        {selectedFiles.length}/6 selected
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={selectedFiles.length >= 6}
                                    >
                                        Add More Photos
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full p-12 text-center absolute inset-0">
                                <UploadCloud className="w-10 h-10 text-muted-foreground mb-4" />
                                <h3 className="text-sm font-medium text-foreground mb-1">Upload photos</h3>
                                <p className="text-xs text-muted-foreground">
                                    Add up to 6 images.
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-4"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Browse Photos
                                </Button>
                            </div>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            name="images"
                            accept="image/*"
                            multiple
                            onChange={handleImageChange}
                            className="hidden"
                        />
                    </div>
                </section>

                <section className="space-y-6">
                    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Item Details
                    </h2>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" name="title" required placeholder="e.g., Silk Floral Abaya" className="h-12" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            <select
                                id="category"
                                name="category"
                                required
                                className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                            >
                                <option value="">Select Category</option>
                                {["Dresses", "Tops", "Outerwear", "Bottoms", "Activewear", "Accessories"].map((cat) => (
                                    <option key={cat} value={cat.toUpperCase()}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="price">Price ($)</Label>
                            <Input id="price" name="price" type="number" step="0.01" min="0.50" required placeholder="0.00" className="h-12" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="brand">Brand</Label>
                            <Input id="brand" name="brand" placeholder="e.g., Luxury Modest" className="h-12" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <textarea
                            id="description"
                            name="description"
                            required
                            rows={5}
                            placeholder="Describe the texture, fit, and details of this piece..."
                            className="w-full border border-border bg-background p-4 text-sm focus:border-primary focus:outline-none transition-colors resize-none"
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="condition">Condition</Label>
                            <select
                                id="condition"
                                name="condition"
                                className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                            >
                                <option value="">Select Condition</option>
                                {["New with tags", "Like new", "Good", "Fair"].map(cond => (
                                    <option key={cond} value={cond}>{cond}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="size">Size</Label>
                            <Input id="size" name="size" placeholder="e.g., Medium / 38" className="h-12" />
                        </div>
                    </div>
                </section>

                <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-6">
                    <p className="text-xs text-muted-foreground max-w-xs text-center sm:text-left">
                        By publishing, you agree to our community guidelines.
                    </p>
                    <Button
                        type="submit"
                        isLoading={loading}
                        size="lg"
                        className="px-12 w-full sm:w-auto"
                    >
                        Publish Listing
                    </Button>
                </div>
            </form>
        </div>
    );

    if (!isSeller) {
        return (
            <div className="px-4 py-6 sm:px-6 lg:px-8">
                <div className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-5xl justify-center rounded-[2rem] border border-border/80 bg-card p-5 shadow-[0_24px_60px_rgba(114,86,67,0.08)] sm:p-8">
                    <div className="w-full space-y-8 text-left">
                        <div className="rounded-[1.75rem] bg-[linear-gradient(135deg,#f3e7de_0%,#ecdccf_55%,#e2cab9_100%)] p-6 sm:p-8">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Seller onboarding</p>
                            <h1 className="mt-3 font-serif text-4xl md:text-6xl font-bold text-foreground">
                            Become a Seller
                            </h1>
                            <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
                                Join our community of fashion sellers. Turn your wardrobe into a boutique with secure payouts.
                            </p>
                        </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 text-left">
                        {[
                            { title: "Global Reach", desc: "Connect with buyers looking for modest fashion worldwide.", icon: Tag },
                            { title: "Secure Payouts", desc: "Fast, encrypted transfers via Stripe directly to your bank.", icon: CreditCard },
                            { title: "Full Control", desc: "Manage buying and selling from one dashboard.", icon: CheckCircle2 },
                        ].map((item) => (
                            <div key={item.title} className="rounded-[1.5rem] border border-border/80 bg-[linear-gradient(180deg,#fbf7f4_0%,#f3e9e2_100%)] p-5">
                                <item.icon className="w-6 h-6 text-foreground mb-4" />
                                <h3 className="font-medium text-foreground mb-2">{item.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-700 text-sm p-4 border border-red-200 text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <Button
                            onClick={handleStripeOnboarding}
                            isLoading={loading}
                            size="lg"
                            className="w-full sm:w-auto px-12"
                        >
                            Connect with Stripe
                            <ChevronRight className="ml-2 w-5 h-5" />
                        </Button>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-widest">
                            Secure Onboarding Powered by Stripe
                        </p>
                    </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
        <div className={`${showCreateForm ? "hidden" : "block"} min-h-screen bg-[#f7f3ef] px-4 pb-28 pt-3 sm:hidden`}>
            <div className="mb-4 flex items-center justify-between border-y border-border/80 px-1 py-1.5">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setMobileTab(tab)}
                        className={`relative px-2 py-2 text-xl leading-none ${mobileTab === tab ? "font-semibold text-foreground" : "text-foreground/75"}`}
                    >
                        {tab === "LISTINGS" ? "Listings" : tab[0] + tab.slice(1).toLowerCase()}
                        {mobileTab === tab ? (
                            <span className="absolute bottom-0 left-2 right-2 h-[3px] rounded-full bg-[#5f4437]" />
                        ) : null}
                    </button>
                ))}
            </div>

            <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="mb-6 flex w-full items-center gap-4 rounded-[1.25rem] border border-border/80 bg-card/90 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
            >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ecdfd3] text-foreground">
                    <PackagePlus className="h-8 w-8" />
                </div>
                <div className="flex-1">
                    <p className="font-serif text-2xl leading-none text-foreground">List New Item</p>
                    <p className="mt-1 text-[1.05rem] text-muted-foreground">Tap here to add a new item for sale</p>
                </div>
                <ChevronRight className="h-5 w-5 text-foreground/70" />
            </button>

            <h2 className="mb-3 font-serif text-3xl leading-none text-foreground">My Listings</h2>
            {error ? (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            <div className="space-y-3">
                {filteredListings.length === 0 ? (
                    <div className="rounded-[1.25rem] border border-dashed border-border bg-card/80 px-5 py-12 text-center">
                        <p className="text-base text-muted-foreground">No listings in this tab yet.</p>
                        <button
                            type="button"
                            onClick={() => setShowCreateForm(true)}
                            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#5f4437] px-4 py-2 text-sm text-white"
                        >
                            <PackagePlus className="h-4 w-4" />
                            Add your first item
                        </button>
                    </div>
                ) : (
                    filteredListings.map((listing) => {
                        const statusLabel = listing.status === "AVAILABLE" ? "Active" : listing.status === "SOLD" ? "Sold" : "Pending";
                        const statusClass =
                            statusLabel === "Active"
                                ? "bg-[#7b6658] text-white"
                                : statusLabel === "Sold"
                                    ? "bg-[#a18878] text-white"
                                    : "bg-[#efe3d7] text-foreground";

                        return (
                            <Link
                                key={listing.id}
                                href={`/listings/${listing.id}`}
                                className="grid grid-cols-[112px_1fr] gap-3 rounded-[1.2rem] border border-border/80 bg-card p-2"
                            >
                                <div className="relative overflow-hidden rounded-[0.8rem]">
                                    <div className="relative aspect-[3/4]">
                                        <Image src={listing.image_url} alt={listing.title} fill className="object-contain bg-card/60 p-1" sizes="120px" />
                                    </div>
                                    <div className="absolute right-2 top-2 rounded-full bg-white/85 p-1">
                                        <Heart className="h-4 w-4 text-foreground" />
                                    </div>
                                </div>
                                <div className="min-w-0 p-1">
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        <span className={`rounded-md px-2 py-1 text-xs ${statusClass}`}>{statusLabel}</span>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void handleDeleteListing(listing.id);
                                            }}
                                            disabled={deletingListingId === listing.id}
                                            className="inline-flex items-center rounded-md border border-border/70 px-2 py-1 text-xs text-foreground/80 disabled:opacity-50"
                                        >
                                            {deletingListingId === listing.id ? "Deleting..." : "Delete"}
                                        </button>
                                    </div>
                                    <p className="line-clamp-1 text-4xl leading-none text-foreground">{listing.title}</p>
                                    <p className="mt-1 line-clamp-2 text-base leading-5 text-foreground/80">{listing.description}</p>
                                    <p className="mt-2 text-3xl leading-none text-foreground">${Number(listing.price).toLocaleString()}</p>
                                </div>
                            </Link>
                        );
                    })
                )}
            </div>
        </div>

        <div className={`${showCreateForm ? "block" : "hidden"} px-4 py-6 sm:hidden`}>
            {renderCreateForm(true)}
        </div>

        <div className="hidden px-4 py-6 sm:block sm:px-6 lg:px-8">
            {renderCreateForm(false)}
        </div>
        </>
    );
}
