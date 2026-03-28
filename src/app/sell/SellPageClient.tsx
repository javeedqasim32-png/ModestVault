"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createListing, deleteListing } from "../actions/listings";
import { onboardSellerAction } from "../actions/stripe";
import { Tag, UploadCloud, ChevronRight, Heart, PackagePlus, X, Printer, TrendingUp, Users, ShieldCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useRouter } from "next/navigation";
import { getCategories, getStyles, getSubcategories, getTypes } from "@/lib/taxonomy";
import { validateListingTaxonomy, type ListingTaxonomyErrors } from "@/lib/taxonomyValidation";

type ListingItem = {
    id: string;
    title: string;
    description: string;
    price: number | string;
    image_url: string;
    style?: string;
    status: string;
    moderation_status?: string;
    rejection_reason?: string | null;
    label_url?: string | null;
};

type SellPageClientProps = {
    isSellerInitially: boolean;
    listings: ListingItem[];
};

const tabs = ["LISTINGS", "APPROVED", "PENDING", "REJECTED"] as const;
const styleOptions = getStyles();
const categoryOptions = getCategories();
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 18 * 1024 * 1024;
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_OPTIMIZED_DIMENSION = 2000;

function replaceFileExtension(filename: string, nextExt: string) {
    const cleanName = filename.replace(/\.[^/.]+$/, "");
    return `${cleanName}.${nextExt}`;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.src = objectUrl;
    try {
        if (typeof image.decode === "function") {
            await image.decode();
        } else {
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error(`Unable to load image "${file.name}"`));
            });
        }
        return image;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((output) => resolve(output), "image/webp", quality);
    });
    if (!blob) {
        throw new Error("Failed to encode image.");
    }
    return blob;
}

async function optimizeImageFile(file: File): Promise<File> {
    if (!COMPRESSIBLE_TYPES.has(file.type)) {
        return file;
    }

    try {
        const image = await loadImageFromFile(file);
        const maxSide = Math.max(image.naturalWidth, image.naturalHeight);
        const ratio = maxSide > MAX_OPTIMIZED_DIMENSION ? MAX_OPTIMIZED_DIMENSION / maxSide : 1;
        const width = Math.max(1, Math.round(image.naturalWidth * ratio));
        const height = Math.max(1, Math.round(image.naturalHeight * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
            return file;
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, width, height);

        const qualitySteps = [0.88, 0.82, 0.76, 0.7];
        let bestBlob: Blob | null = null;
        for (const quality of qualitySteps) {
            const attempt = await canvasToWebpBlob(canvas, quality);
            bestBlob = attempt;
            if (attempt.size <= MAX_IMAGE_BYTES) {
                break;
            }
        }

        if (!bestBlob || bestBlob.size >= file.size) {
            return file;
        }

        return new File(
            [bestBlob],
            replaceFileExtension(file.name || "upload", "webp"),
            { type: "image/webp", lastModified: Date.now() }
        );
    } catch (error) {
        console.warn("Image optimization skipped:", error);
        return file;
    }
}

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
    const [style, setStyle] = useState("");
    const [category, setCategory] = useState("");
    const [subcategory, setSubcategory] = useState("");
    const [listingType, setListingType] = useState("");
    const [taxonomyErrors, setTaxonomyErrors] = useState<ListingTaxonomyErrors>({});
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const subcategoryOptions = useMemo(() => getSubcategories(category), [category]);
    const typeOptions = useMemo(() => getTypes(subcategory), [subcategory]);
    const taxonomyValidation = useMemo(
        () =>
            validateListingTaxonomy({
                style,
                category,
                subcategory: subcategory || null,
                type: listingType || null,
            }),
        [style, category, subcategory, listingType]
    );

    const filteredListings = useMemo(() => {
        if (mobileTab === "LISTINGS") return listings;
        if (mobileTab === "APPROVED") return listings.filter((listing) => listing.moderation_status === "APPROVED");
        if (mobileTab === "PENDING") return listings.filter((listing) => listing.moderation_status === "PENDING");
        return listings.filter((listing) => listing.moderation_status === "REJECTED");
    }, [listings, mobileTab]);

    useEffect(() => {
        if (!subcategory) {
            if (listingType) setListingType("");
            return;
        }

        const allowedTypes = getTypes(subcategory);
        if (!allowedTypes.includes(listingType)) {
            setListingType("");
        }
    }, [subcategory, listingType]);

    useEffect(() => {
        if (!category) {
            if (subcategory) setSubcategory("");
            if (listingType) setListingType("");
            return;
        }

        const allowedSubcategories = getSubcategories(category);
        if (!allowedSubcategories.includes(subcategory)) {
            if (subcategory) setSubcategory("");
            if (listingType) setListingType("");
        }
    }, [category, subcategory, listingType]);

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

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        setError(""); // Clear previous errors

        if (files.length === 0) {
            e.target.value = "";
            return;
        }

        if (selectedFiles.length >= MAX_IMAGES) {
            setError("You can upload a maximum of 6 images.");
            e.target.value = "";
            return;
        }

        const merged = [...selectedFiles];

        for (const rawFile of files) {
            const file = await optimizeImageFile(rawFile);
            if (!COMPRESSIBLE_TYPES.has(file.type) && file.size > MAX_IMAGE_BYTES) {
                setError(`"${rawFile.name}" is larger than 10MB. Please choose a smaller file.`);
                e.target.value = "";
                return;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                setError(`"${rawFile.name}" is still larger than 10MB after optimization.`);
                e.target.value = "";
                return;
            }

            const duplicate = merged.some(
                (existing) =>
                    existing.name === file.name &&
                    existing.size === file.size &&
                    existing.lastModified === file.lastModified
            );
            if (!duplicate) {
                merged.push(file);
            }

            if (merged.length > MAX_IMAGES) {
                setError("You can upload a maximum of 6 images.");
                e.target.value = "";
                return;
            }
        }

        const totalImageBytes = merged.reduce((total, file) => total + file.size, 0);
        if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
            setError("Total image upload size is too large. Please keep all images under 18MB combined.");
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
                setTaxonomyErrors({});
                try {
                    if (!taxonomyValidation.ok) {
                        setTaxonomyErrors(taxonomyValidation.errors);
                        setError(taxonomyValidation.message);
                        setLoading(false);
                        return;
                    }

                    const formData = new FormData(e.currentTarget);
                    formData.delete("images");
                    formData.set("style", taxonomyValidation.normalized.style);
                    formData.set("category", taxonomyValidation.normalized.category);
                    formData.set("subcategory", taxonomyValidation.normalized.subcategory || "");
                    formData.set("type", taxonomyValidation.normalized.type || "");
                    if (selectedFiles.length === 0) {
                        setError("Please upload at least one image.");
                        setLoading(false);
                        return;
                    }
                    selectedFiles.forEach((file) => formData.append("images", file));
                    const res = await createListing(formData);
                    if (res?.error) {
                        setError(res.error);
                    } else if (res?.success) {
                        // Successfully created! Close form and refresh listings
                        setShowCreateForm(false);
                        setSelectedFiles([]);
                        setStyle("");
                        setCategory("");
                        setSubcategory("");
                        setListingType("");
                        setTaxonomyErrors({});
                        router.refresh();
                    }
                } catch (err) {
                    console.error("Create listing submit failed:", err);
                    setError(err instanceof Error ? err.message : "An unexpected error occurred.");
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
                                        disabled={selectedFiles.length >= MAX_IMAGES}
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
                                    Add up to 6 images. We optimize photos automatically without cropping.
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
                            <Label htmlFor="style">Style</Label>
                            <select
                                id="style"
                                name="style"
                                required
                                value={style}
                                onChange={(event) => {
                                    setStyle(event.target.value);
                                    if (taxonomyErrors.style) {
                                        setTaxonomyErrors((prev) => ({ ...prev, style: undefined }));
                                    }
                                }}
                                className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                            >
                                <option value="">Select Style</option>
                                {styleOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                            {taxonomyErrors.style ? <p className="text-xs text-red-600">{taxonomyErrors.style}</p> : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            <select
                                id="category"
                                name="category"
                                required
                                value={category}
                                onChange={(event) => {
                                    const nextCategory = event.target.value;
                                    setCategory(nextCategory);
                                    if (taxonomyErrors.category || taxonomyErrors.subcategory || taxonomyErrors.type) {
                                        setTaxonomyErrors((prev) => ({
                                            ...prev,
                                            category: undefined,
                                            subcategory: undefined,
                                            type: undefined,
                                        }));
                                    }
                                }}
                                className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                            >
                                <option value="">Select Category</option>
                                {categoryOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                            {taxonomyErrors.category ? <p className="text-xs text-red-600">{taxonomyErrors.category}</p> : null}
                        </div>
                        {subcategoryOptions.length > 0 ? (
                            <div className="space-y-2">
                                <Label htmlFor="subcategory">Subcategory</Label>
                                <select
                                    id="subcategory"
                                    name="subcategory"
                                    required
                                    value={subcategory}
                                    onChange={(event) => {
                                        setSubcategory(event.target.value);
                                        if (taxonomyErrors.subcategory || taxonomyErrors.type) {
                                            setTaxonomyErrors((prev) => ({ ...prev, subcategory: undefined, type: undefined }));
                                        }
                                    }}
                                    className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                                >
                                    <option value="">Select Subcategory</option>
                                    {subcategoryOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                                {taxonomyErrors.subcategory ? <p className="text-xs text-red-600">{taxonomyErrors.subcategory}</p> : null}
                            </div>
                        ) : (
                            <input type="hidden" name="subcategory" value="" />
                        )}
                    </div>

                    {typeOptions.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="type">Type</Label>
                                <select
                                    id="type"
                                    name="type"
                                    required
                                    value={listingType}
                                    onChange={(event) => {
                                        setListingType(event.target.value);
                                        if (taxonomyErrors.type) {
                                            setTaxonomyErrors((prev) => ({ ...prev, type: undefined }));
                                        }
                                    }}
                                    className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                                >
                                    <option value="">Select Type</option>
                                    {typeOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                                {taxonomyErrors.type ? <p className="text-xs text-red-600">{taxonomyErrors.type}</p> : null}
                            </div>
                        </div>
                    ) : (
                        <input type="hidden" name="type" value="" />
                    )}

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
                        disabled={!taxonomyValidation.ok || loading}
                        className="px-12 w-full sm:w-auto"
                    >
                        Publish Listing
                    </Button>
                </div>
            </form>
        </div>
    );

    if (!isSeller) {
        const sellerBenefits = [
            {
                title: "Keep 90% of your sale",
                desc: "Only a 10% platform fee, designed for modest fashion sellers.",
                icon: TrendingUp,
                iconBg: "#d6edd9",
                iconColor: "#2f9a43",
            },
            {
                title: "Dedicated buyer audience",
                desc: "Shoppers actively looking for modest fashion with stronger conversion.",
                icon: Users,
                iconBg: "#cfe2f6",
                iconColor: "#246fcd",
            },
            {
                title: "Buyer protection built-in",
                desc: "Secure payments, dispute support, and trust signals boost sales.",
                icon: Heart,
                iconBg: "#f3d3e2",
                iconColor: "#ce2f3b",
            },
            {
                title: "Fast, direct payouts",
                desc: "Powered by Stripe Connect with direct transfer to your bank.",
                icon: CreditCard,
                iconBg: "#e8d5f1",
                iconColor: "#7a2dc2",
            },
        ] as const;

        return (
            <div className="bg-[#f4efea] px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
                <div className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-[1360px] flex-col overflow-hidden bg-[#f4efea] sm:rounded-[2rem] sm:border sm:border-border/80 sm:shadow-[0_35px_80px_rgba(114,86,67,0.10)]">
                    <section
                        className="relative overflow-hidden border-b border-border/80 px-5 pb-6 pt-4 text-center sm:px-10 sm:pb-10 sm:pt-9 lg:px-14"
                        style={{ backgroundImage: "linear-gradient(120deg,#3e2619 0%,#6d4327 45%,#a4774f 100%)" }}
                    >
                        <div className="pointer-events-none absolute -left-14 bottom-4 h-36 w-36 rounded-full bg-white/7" />
                        <div className="pointer-events-none absolute -right-10 -top-8 h-44 w-44 rounded-full bg-white/9" />
                        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/35 bg-white/10 text-3xl sm:mb-5 sm:h-16 sm:w-16 sm:text-4xl">
                            🏪
                        </div>
                        <h1 className="font-serif text-[1.95rem] leading-[1.08] text-white sm:text-[2.85rem]">
                            Start Selling on Modaire
                        </h1>
                        <p className="mx-auto mt-2 max-w-2xl text-[0.94rem] leading-[1.55] text-[#f1ddd0] sm:mt-4 sm:text-[1.1rem] sm:leading-[1.8]">
                            Reach thousands of modest fashion buyers.
                        </p>
                        <div className="mx-auto mt-4 w-full max-w-md sm:mt-7">
                            <Button
                                onClick={handleStripeOnboarding}
                                isLoading={loading}
                                size="lg"
                                className="h-11 w-full rounded-full bg-[#aa8464] px-6 text-[0.9rem] font-semibold tracking-[0.03em] text-white hover:bg-[#946f52] sm:h-14 sm:px-8 sm:text-[1.04rem]"
                            >
                                Continue to Stripe Setup
                                <ChevronRight className="ml-2 h-5 w-5" />
                            </Button>
                        </div>
                    </section>

                    <section className="px-5 py-5 sm:px-10 sm:py-10 lg:px-14">
                        <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#8d7565]">Why Sell on Modaire</p>

                        {error ? (
                            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {error}
                            </div>
                        ) : null}

                        <div className="mt-3 space-y-4 sm:mt-5 sm:space-y-6">
                            {sellerBenefits.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.title} className="flex items-center gap-4 sm:gap-5">
                                        <div
                                            className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden border border-black/5 sm:h-[76px] sm:w-[76px]"
                                            style={{
                                                backgroundColor: item.iconBg,
                                                borderRadius: "12px",
                                                clipPath: "inset(0 round 12px)",
                                            }}
                                        >
                                            <Icon className="h-6 w-6 sm:h-9 sm:w-9" style={{ color: item.iconColor, strokeWidth: 2.3 }} />
                                        </div>
                                        <div className="flex min-h-[56px] flex-col justify-center sm:min-h-[76px]">
                                            <h3 className="text-[0.95rem] font-semibold leading-[1.18] text-foreground sm:text-[1.25rem]">{item.title}</h3>
                                            <p className="mt-0 max-w-3xl text-[0.66rem] leading-[1.55] text-[#8d7565] sm:text-[0.94rem]">
                                                {item.desc}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-5 rounded-[1.4rem] border border-[#b7d9d0] bg-[#d8e9e7] px-4 py-3 text-[#2f7f5d] sm:mt-10 sm:rounded-[2rem] sm:px-8 sm:py-6">
                            <p className="flex items-start gap-2 text-[0.84rem] leading-[1.42] sm:gap-4 sm:text-[0.98rem] sm:leading-[1.35]">
                                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 sm:mt-1 sm:h-9 sm:w-9" />
                                <span>
                                    <strong className="font-semibold text-[#256f4f]">Your buyer account is still active.</strong>{" "}
                                    Adding seller access lets you list items while continuing to shop normally.
                                </span>
                            </p>
                        </div>

                    </section>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className={`${showCreateForm ? "hidden" : "block"} min-h-screen bg-[#f4efea] px-4 pb-28 pt-3 sm:hidden`}>
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
                            const modStatus = listing.moderation_status || "PENDING";
                            const isApproved = modStatus === "APPROVED";
                            const isRejected = modStatus === "REJECTED";
                            const statusClass = isApproved
                                ? "bg-green-100 text-green-700"
                                : isRejected
                                    ? "bg-red-100 text-red-700"
                                    : "bg-yellow-100 text-yellow-700";

                            const label = isApproved ? (listing.status === "SOLD" ? "SOLD" : "APPROVED") : modStatus;

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
                                            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass}`}>
                                                {label}
                                            </span>
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
                                        {isRejected && listing.rejection_reason && (
                                            <p className="mt-2 text-sm text-red-600 font-medium">Reason: {listing.rejection_reason}</p>
                                        )}
                                        {listing.label_url && (
                                            <div className="mt-3">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        window.open(listing.label_url as string, "_blank", "noopener,noreferrer");
                                                    }}
                                                >
                                                    <PackagePlus className="h-4 w-4" />
                                                    Print Shipping Label
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            </div>

            <div className={`${showCreateForm ? "block" : "hidden"} bg-[#f4efea] px-4 py-6 sm:hidden`}>
                {renderCreateForm(true)}
            </div>

            <div className="hidden bg-[#f4efea] px-4 py-6 sm:block sm:px-6 lg:px-8">
                <div className="mx-auto max-w-6xl space-y-8">
                    {renderCreateForm(false)}

                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="font-serif text-3xl font-bold text-foreground">My Listings</h2>
                            <Link href="/dashboard/sales">
                                <Button variant="outline" className="rounded-full">Manage Sales & Labels</Button>
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {listings.length === 0 ? (
                                <div className="col-span-full rounded-[2rem] border border-dashed border-border py-20 text-center bg-card/40">
                                    <Tag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                                    <h3 className="text-xl font-serif font-bold text-foreground mb-2">No listings yet</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto">
                                        You haven&apos;t created any items for sale. Start by filling out the form above!
                                    </p>
                                </div>
                            ) : (
                                listings.map((listing) => (
                                    <Card key={listing.id} className="p-0 overflow-hidden border-border/60 group hover:border-primary/20 transition-all">
                                        <div className="relative aspect-[4/3] bg-muted/20">
                                            <Image
                                                src={listing.image_url}
                                                alt={listing.title}
                                                fill
                                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                            <div className="absolute top-3 right-3 flex gap-2">
                                                <Badge className={`${listing.status === "SOLD" ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary"} rounded-full border-none`}>
                                                    {listing.status}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            <h3 className="font-serif text-xl font-bold mb-1 line-clamp-1">{listing.title}</h3>
                                            <p className="text-2xl font-bold text-foreground mb-4">${Number(listing.price).toLocaleString()}</p>

                                            <div className="flex items-center gap-2 pt-4 border-t border-border/50">
                                                {listing.label_url ? (
                                                    <a
                                                        href={listing.label_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-90 transition-all"
                                                    >
                                                        <Printer className="w-4 h-4" />
                                                        Reprint Label
                                                    </a>
                                                ) : (
                                                    <Link href={`/listings/${listing.id}`} className="flex-1">
                                                        <Button variant="outline" className="w-full rounded-xl">View Details</Button>
                                                    </Link>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDeleteListing(listing.id)}
                                                    disabled={deletingListingId === listing.id}
                                                    className="h-10 w-10 text-destructive hover:bg-destructive/10 rounded-xl"
                                                >
                                                    <X className="w-5 h-5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
