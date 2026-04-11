"use client";

import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { useEffect, useMemo, useRef, useState } from "react";
import { createListing, deleteListing, replaceListingImages, updateListing } from "../actions/listings";
import { onboardSellerAction } from "../actions/stripe";
import { Tag, UploadCloud, ChevronLeft, ChevronRight, Heart, PackagePlus, X, Printer, TrendingUp, Users, ShieldCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useRouter } from "next/navigation";
import { getCategories, getStyles, getSubcategories, getTypes } from "@/lib/taxonomy";
import { validateListingTaxonomy, type ListingTaxonomyErrors } from "@/lib/taxonomyValidation";

type ListingItem = {
    id: string;
    title: string;
    description: string;
    price: number | string;
    image_url: string;
    created_at?: string;
    updated_at?: string;
    style?: string;
    category?: string;
    subcategory?: string | null;
    type?: string | null;
    condition?: string | null;
    brand?: string | null;
    size?: string | null;
    status: string;
    moderation_status?: string;
    rejection_reason?: string | null;
    label_url?: string | null;
};

type SellPageClientProps = {
    currentUserId: string;
    isSellerInitially: boolean;
    listings: ListingItem[];
    openCreateInitially?: boolean;
    openManageInitially?: boolean;
    analytics: {
        totalListings: number;
        deliveredRevenue: number;
        activeListings: number;
        averagePrice: number;
        soldListings: number;
        pendingListings: number;
    };
};

type SellTab = "LISTINGS" | "SOLD" | "ACTIVE" | "PENDING" | "ANALYTICS";
const mobileTabs: { key: SellTab; label: string }[] = [
    { key: "LISTINGS", label: "Listings" },
    { key: "SOLD", label: "Sold" },
    { key: "ACTIVE", label: "Active" },
    { key: "PENDING", label: "Pending" },
    { key: "ANALYTICS", label: "Analytics" },
];
const styleOptions = getStyles();
const categoryOptions = getCategories();
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 18 * 1024 * 1024;
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_OPTIMIZED_DIMENSION = 2000;
const MAX_MEASUREMENTS_CHARS = 300;
const MEASUREMENTS_MARKER = "\n\nMeasurements:\n";
const SOLD_VIEWED_KEY_PREFIX = "sell-viewed-sold";
const cormorantHeading = localFont({
    src: [
        { path: "../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
        { path: "../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
    ],
    display: "swap",
});

function replaceFileExtension(filename: string, nextExt: string) {
    const cleanName = filename.replace(/\.[^/.]+$/, "");
    return `${cleanName}.${nextExt}`;
}

function extractMeasurementsFromDescription(description: string) {
    const markerIndex = description.indexOf(MEASUREMENTS_MARKER);
    if (markerIndex === -1) {
        return "";
    }
    return description.slice(markerIndex + MEASUREMENTS_MARKER.length).trim();
}

function stripMeasurementsFromDescription(description: string) {
    const markerIndex = description.indexOf(MEASUREMENTS_MARKER);
    if (markerIndex === -1) {
        return description;
    }
    return description.slice(0, markerIndex).trimEnd();
}

function composeListingDescription(description: string, measurements: string) {
    const baseDescription = stripMeasurementsFromDescription(description).trim();
    const normalizedMeasurements = measurements.trim().slice(0, MAX_MEASUREMENTS_CHARS);
    if (!normalizedMeasurements) {
        return baseDescription;
    }
    return `${baseDescription}${MEASUREMENTS_MARKER}${normalizedMeasurements}`;
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

export default function SellPageClient({
    currentUserId,
    isSellerInitially,
    listings,
    openCreateInitially = false,
    openManageInitially = false,
    analytics,
}: SellPageClientProps) {
    const router = useRouter();
    const [isSeller] = useState(isSellerInitially);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [mobileTab, setMobileTab] = useState<SellTab>("LISTINGS");
    const [showCreateForm, setShowCreateForm] = useState(openCreateInitially);
    const [editingListing, setEditingListing] = useState<ListingItem | null>(null);
    const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editFiles, setEditFiles] = useState<File[]>([]);
    const [editPreviewUrls, setEditPreviewUrls] = useState<string[]>([]);
    const [style, setStyle] = useState("");
    const [category, setCategory] = useState("");
    const [subcategory, setSubcategory] = useState("");
    const [listingType, setListingType] = useState("");
    const [editStyle, setEditStyle] = useState("");
    const [editCategory, setEditCategory] = useState("");
    const [editSubcategory, setEditSubcategory] = useState("");
    const [editListingType, setEditListingType] = useState("");
    const [taxonomyErrors, setTaxonomyErrors] = useState<ListingTaxonomyErrors>({});
    const [editTaxonomyErrors, setEditTaxonomyErrors] = useState<ListingTaxonomyErrors>({});
    const [viewedSoldListingIds, setViewedSoldListingIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const mobileMyListingsRef = useRef<HTMLHeadingElement | null>(null);
    const desktopMyListingsRef = useRef<HTMLHeadingElement | null>(null);
    const subcategoryOptions = useMemo(() => getSubcategories(category), [category]);
    const typeOptions = useMemo(() => getTypes(subcategory), [subcategory]);
    const editSubcategoryOptions = useMemo(() => getSubcategories(editCategory), [editCategory]);
    const editTypeOptions = useMemo(() => getTypes(editSubcategory), [editSubcategory]);
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
    const editTaxonomyValidation = useMemo(
        () =>
            validateListingTaxonomy({
                style: editStyle,
                category: editCategory,
                subcategory: editSubcategory || null,
                type: editListingType || null,
            }),
        [editStyle, editCategory, editSubcategory, editListingType]
    );

    const filteredListings = useMemo(() => {
        const byCreatedDesc = (a: ListingItem, b: ListingItem) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        const byUpdatedDesc = (a: ListingItem, b: ListingItem) =>
            new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();

        if (mobileTab === "LISTINGS") return [...listings].sort(byCreatedDesc);
        if (mobileTab === "SOLD") return listings.filter((listing) => listing.status === "SOLD").sort(byUpdatedDesc);
        if (mobileTab === "ACTIVE") return listings.filter((listing) => listing.moderation_status === "APPROVED" && listing.status !== "SOLD").sort(byCreatedDesc);
        if (mobileTab === "PENDING") return listings.filter((listing) => listing.moderation_status === "PENDING").sort(byCreatedDesc);
        return [];
    }, [listings, mobileTab]);

    const listingStats = useMemo(() => {
        const activeCount = listings.filter((listing) => listing.moderation_status === "APPROVED" && listing.status !== "SOLD").length;
        const soldCount = listings.filter((listing) => listing.status === "SOLD").length;
        const listedValue = listings.reduce((sum, listing) => sum + Number(listing.price || 0), 0);
        return { activeCount, soldCount, listedValue };
    }, [listings]);
    const soldViewedStorageKey = `${SOLD_VIEWED_KEY_PREFIX}:${currentUserId}`;

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(soldViewedStorageKey);
            if (!raw) {
                setViewedSoldListingIds(new Set());
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setViewedSoldListingIds(new Set(parsed.filter((item): item is string => typeof item === "string")));
            }
        } catch {
            setViewedSoldListingIds(new Set());
        }
    }, [soldViewedStorageKey]);

    const markSoldListingsViewed = (listingIds: string[]) => {
        if (listingIds.length === 0) return;
        setViewedSoldListingIds((prev) => {
            const next = new Set(prev);
            let changed = false;
            for (const listingId of listingIds) {
                if (!next.has(listingId)) {
                    next.add(listingId);
                    changed = true;
                }
            }
            if (changed) {
                window.localStorage.setItem(soldViewedStorageKey, JSON.stringify(Array.from(next)));
            }
            return changed ? next : prev;
        });
    };

    useEffect(() => {
        if (mobileTab !== "SOLD") return;
        const soldIds = filteredListings
            .filter((listing) => listing.status === "SOLD")
            .map((listing) => listing.id);
        markSoldListingsViewed(soldIds);
    }, [mobileTab, filteredListings]);

    const isNewSoldListing = (listing: ListingItem) =>
        listing.status === "SOLD" && !viewedSoldListingIds.has(listing.id);

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

    useEffect(() => {
        if (!editSubcategory) {
            if (editListingType) setEditListingType("");
            return;
        }

        const allowedTypes = getTypes(editSubcategory);
        if (!allowedTypes.includes(editListingType)) {
            setEditListingType("");
        }
    }, [editSubcategory, editListingType]);

    useEffect(() => {
        if (!editCategory) {
            if (editSubcategory) setEditSubcategory("");
            if (editListingType) setEditListingType("");
            return;
        }

        const allowedSubcategories = getSubcategories(editCategory);
        if (!allowedSubcategories.includes(editSubcategory)) {
            if (editSubcategory) setEditSubcategory("");
            if (editListingType) setEditListingType("");
        }
    }, [editCategory, editSubcategory, editListingType]);

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
    const moveImage = (fromIndex: number, toIndex: number) => {
        setSelectedFiles((prev) => {
            if (toIndex < 0 || toIndex >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    };

    useEffect(() => {
        const urls = selectedFiles.map((file) => URL.createObjectURL(file));
        setPreviewUrls(urls);
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [selectedFiles]);

    useEffect(() => {
        const urls = editFiles.map((file) => URL.createObjectURL(file));
        setEditPreviewUrls(urls);
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [editFiles]);

    useEffect(() => {
        if (!openManageInitially) return;
        setShowCreateForm(false);
        const raf = requestAnimationFrame(() => {
            const target =
                window.matchMedia("(min-width: 640px)").matches
                    ? desktopMyListingsRef.current
                    : mobileMyListingsRef.current;
            target?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return () => cancelAnimationFrame(raf);
    }, [openManageInitially]);

    const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length === 0) {
            e.target.value = "";
            return;
        }

        const merged = [...editFiles];
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
            merged.push(file);
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

        setEditFiles(merged);
        e.target.value = "";
    };

    const removeEditImage = (indexToRemove: number) => {
        setEditFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
    };
    const moveEditImage = (fromIndex: number, toIndex: number) => {
        setEditFiles((prev) => {
            if (toIndex < 0 || toIndex >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    };

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

    const startEditListing = (listing: ListingItem) => {
        setEditingListing(listing);
        setEditFiles([]);
        setError("");
        setEditStyle(listing.style || "");
        setEditCategory(listing.category || "");
        setEditSubcategory(listing.subcategory || "");
        setEditListingType(listing.type || "");
        setEditTaxonomyErrors({});
    };

    const closeEditListing = () => {
        setEditingListing(null);
        setEditFiles([]);
        setEditStyle("");
        setEditCategory("");
        setEditSubcategory("");
        setEditListingType("");
        setEditTaxonomyErrors({});
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
            <div className="mb-8 rounded-[1.75rem] bg-[linear-gradient(135deg,#f3e7de_0%,#ecdccf_55%,#e2cab9_100%)] px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-5">
                <h1 className={`${cormorantHeading.className} mt-0 text-3xl font-semibold text-foreground md:text-4xl mb-1.5`}>
                    Create Listing
                </h1>
                <p className="text-muted-foreground">
                    If possible, make your cover photo, a photo of the model wearing the article from the website OR a full-length photo of you wearing the article.
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
                    const description = String(formData.get("description") || "");
                    const measurements = String(formData.get("measurements") || "");
                    formData.set("description", composeListingDescription(description, measurements));
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
                                        <div key={`${previewUrl}-${index}`} className="rounded-lg border border-border/70 bg-card p-1.5">
                                            <div className="relative overflow-hidden rounded-md">
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
                                                    className="absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                                <div className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                                                    {index + 1}
                                                </div>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-3 gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => moveImage(index, index - 1)}
                                                    disabled={index === 0}
                                                    className="inline-flex h-7 items-center justify-center rounded-md border border-border text-[10px] text-foreground disabled:opacity-40"
                                                >
                                                    <ChevronLeft className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveImage(index, 0)}
                                                    disabled={index === 0}
                                                    className="inline-flex h-7 items-center justify-center rounded-md border border-border px-1 text-[10px] text-foreground disabled:opacity-40"
                                                >
                                                    Set First
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveImage(index, index + 1)}
                                                    disabled={index === previewUrls.length - 1}
                                                    className="inline-flex h-7 items-center justify-center rounded-md border border-border text-[10px] text-foreground disabled:opacity-40"
                                                >
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
                                    <p className="text-xs text-muted-foreground">
                                        {selectedFiles.length}/6 selected
                                    </p>
                                    <p className="text-xs text-muted-foreground">Image 1 appears first on listing.</p>
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
                            <div className="space-y-2">
                                <Label htmlFor="size">Size</Label>
                                <select
                                    id="size"
                                    name="size"
                                    className="h-12 w-full border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                                    defaultValue=""
                                >
                                    <option value="" disabled>Select Size</option>
                                    <option value="X-Small">X-Small</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Large">Large</option>
                                    <option value="XL">XL</option>
                                    <option value="XXL">XXL</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="measurements">Measurements</Label>
                                <textarea
                                    id="measurements"
                                    name="measurements"
                                    rows={3}
                                    maxLength={MAX_MEASUREMENTS_CHARS}
                                    placeholder="Shoulders, Bust, Waist, Hip, Length"
                                    className="w-full border border-border bg-background p-4 text-sm focus:border-primary focus:outline-none transition-colors resize-none"
                                />
                            </div>
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
                        <h1 className="font-serif text-[23px] font-medium leading-[1.05] text-white">
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
            {editingListing ? (
                <div className="fixed inset-0 z-[80] bg-black/45 p-4">
                    <div className="mx-auto mt-6 max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-serif text-3xl text-foreground">Edit Listing</h3>
                            <button
                                type="button"
                                onClick={closeEditListing}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form
                            onSubmit={async (event) => {
                                event.preventDefault();
                                setSavingEdit(true);
                                setError("");
                                setEditTaxonomyErrors({});
                                try {
                                    const formData = new FormData(event.currentTarget);
                                    const description = String(formData.get("description") || "");
                                    const measurements = String(formData.get("measurements") || "");
                                    formData.set("description", composeListingDescription(description, measurements));
                                    if (!editTaxonomyValidation.ok) {
                                        setEditTaxonomyErrors(editTaxonomyValidation.errors);
                                        setError(editTaxonomyValidation.message);
                                        return;
                                    }
                                    formData.set("style", editTaxonomyValidation.normalized.style);
                                    formData.set("category", editTaxonomyValidation.normalized.category);
                                    formData.set("subcategory", editTaxonomyValidation.normalized.subcategory || "");
                                    formData.set("type", editTaxonomyValidation.normalized.type || "");
                                    const result = await updateListing(editingListing.id, formData);
                                    if (result?.error) {
                                        setError(result.error);
                                        return;
                                    }

                                    if (editFiles.length > 0) {
                                        const imageData = new FormData();
                                        editFiles.forEach((file) => imageData.append("images", file));
                                        const imageResult = await replaceListingImages(editingListing.id, imageData);
                                        if (imageResult?.error) {
                                            setError(imageResult.error);
                                            return;
                                        }
                                    }

                                    closeEditListing();
                                    router.refresh();
                                } finally {
                                    setSavingEdit(false);
                                }
                            }}
                            className="space-y-4"
                        >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <Label htmlFor="edit-title">Title</Label>
                                    <Input id="edit-title" name="title" required defaultValue={editingListing.title} />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="edit-price">Price ($)</Label>
                                    <Input id="edit-price" name="price" type="number" step="0.01" min="0.5" required defaultValue={Number(editingListing.price)} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <Label htmlFor="edit-style">Style</Label>
                                    <select
                                        id="edit-style"
                                        name="style"
                                        required
                                        value={editStyle}
                                        onChange={(event) => {
                                            setEditStyle(event.target.value);
                                            if (editTaxonomyErrors.style) {
                                                setEditTaxonomyErrors((prev) => ({ ...prev, style: undefined }));
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
                                    {editTaxonomyErrors.style ? <p className="text-xs text-red-600">{editTaxonomyErrors.style}</p> : null}
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="edit-category">Category</Label>
                                    <select
                                        id="edit-category"
                                        name="category"
                                        required
                                        value={editCategory}
                                        onChange={(event) => {
                                            setEditCategory(event.target.value);
                                            if (editTaxonomyErrors.category || editTaxonomyErrors.subcategory || editTaxonomyErrors.type) {
                                                setEditTaxonomyErrors((prev) => ({
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
                                    {editTaxonomyErrors.category ? <p className="text-xs text-red-600">{editTaxonomyErrors.category}</p> : null}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {editSubcategoryOptions.length > 0 ? (
                                    <div className="space-y-1">
                                        <Label htmlFor="edit-subcategory">Subcategory</Label>
                                        <select
                                            id="edit-subcategory"
                                            name="subcategory"
                                            required
                                            value={editSubcategory}
                                            onChange={(event) => {
                                                setEditSubcategory(event.target.value);
                                                if (editTaxonomyErrors.subcategory || editTaxonomyErrors.type) {
                                                    setEditTaxonomyErrors((prev) => ({ ...prev, subcategory: undefined, type: undefined }));
                                                }
                                            }}
                                            className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                                        >
                                            <option value="">Select Subcategory</option>
                                            {editSubcategoryOptions.map((item) => (
                                                <option key={item} value={item}>
                                                    {item}
                                                </option>
                                            ))}
                                        </select>
                                        {editTaxonomyErrors.subcategory ? <p className="text-xs text-red-600">{editTaxonomyErrors.subcategory}</p> : null}
                                    </div>
                                ) : (
                                    <input type="hidden" name="subcategory" value="" />
                                )}
                                {editTypeOptions.length > 0 ? (
                                    <div className="space-y-1">
                                        <Label htmlFor="edit-type">Type</Label>
                                        <select
                                            id="edit-type"
                                            name="type"
                                            required
                                            value={editListingType}
                                            onChange={(event) => {
                                                setEditListingType(event.target.value);
                                                if (editTaxonomyErrors.type) {
                                                    setEditTaxonomyErrors((prev) => ({ ...prev, type: undefined }));
                                                }
                                            }}
                                            className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                                        >
                                            <option value="">Select Type</option>
                                            {editTypeOptions.map((item) => (
                                                <option key={item} value={item}>
                                                    {item}
                                                </option>
                                            ))}
                                        </select>
                                        {editTaxonomyErrors.type ? <p className="text-xs text-red-600">{editTaxonomyErrors.type}</p> : null}
                                    </div>
                                ) : (
                                    <input type="hidden" name="type" value="" />
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <Label htmlFor="edit-condition">Condition</Label>
                                    <Input id="edit-condition" name="condition" defaultValue={editingListing.condition || ""} />
                                </div>
                                <div className="space-y-1">
                                    <div className="space-y-1">
                                        <Label htmlFor="edit-size">Size</Label>
                                        <select
                                            id="edit-size"
                                            name="size"
                                            defaultValue={editingListing.size || ""}
                                            className="h-11 w-full rounded-[0.75rem] border border-border bg-background px-3 text-sm text-foreground"
                                        >
                                            <option value="">Select Size</option>
                                            <option value="X-Small">X-Small</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Large">Large</option>
                                            <option value="XL">XL</option>
                                            <option value="XXL">XXL</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="edit-measurements">Measurements</Label>
                                        <textarea
                                            id="edit-measurements"
                                            name="measurements"
                                            rows={3}
                                            maxLength={MAX_MEASUREMENTS_CHARS}
                                            defaultValue={extractMeasurementsFromDescription(editingListing.description)}
                                            placeholder="Shoulders, Bust, Waist, Hip, Length"
                                            className="w-full rounded-[0.75rem] border border-border bg-background p-3 text-sm text-foreground"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="edit-brand">Brand</Label>
                                <Input id="edit-brand" name="brand" defaultValue={editingListing.brand || ""} />
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="edit-description">Description</Label>
                                <textarea
                                    id="edit-description"
                                    name="description"
                                    required
                                    rows={4}
                                    defaultValue={stripMeasurementsFromDescription(editingListing.description)}
                                    className="w-full rounded-[0.75rem] border border-border bg-background p-3 text-sm text-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="edit-images">Replace Photos (optional)</Label>
                                <input
                                    id="edit-images"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleEditImageChange}
                                    className="block w-full rounded-[0.75rem] border border-border bg-background p-2 text-sm"
                                />
                                {editPreviewUrls.length > 0 ? (
                                    <>
                                        <div className="grid grid-cols-3 gap-2">
                                            {editPreviewUrls.map((url, index) => (
                                                <div key={`${url}-${index}`} className="rounded-lg border border-border bg-card p-1.5">
                                                    <div className="relative overflow-hidden rounded-md">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={url} alt={`New image ${index + 1}`} className="aspect-square w-full object-cover" />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeEditImage(index)}
                                                            className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                        <div className="absolute left-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                                                            {index + 1}
                                                        </div>
                                                    </div>
                                                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => moveEditImage(index, index - 1)}
                                                            disabled={index === 0}
                                                            className="inline-flex h-6 items-center justify-center rounded-md border border-border text-foreground disabled:opacity-40"
                                                        >
                                                            <ChevronLeft className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveEditImage(index, 0)}
                                                            disabled={index === 0}
                                                            className="inline-flex h-6 items-center justify-center rounded-md border border-border px-1 text-[10px] text-foreground disabled:opacity-40"
                                                        >
                                                            Set First
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveEditImage(index, index + 1)}
                                                            disabled={index === editPreviewUrls.length - 1}
                                                            className="inline-flex h-6 items-center justify-center rounded-md border border-border text-foreground disabled:opacity-40"
                                                        >
                                                            <ChevronRight className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="mt-2 text-xs text-muted-foreground">Image 1 appears first on listing.</p>
                                    </>
                                ) : null}
                            </div>

                            {error ? <p className="text-sm text-red-600">{error}</p> : null}

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={closeEditListing}>
                                    Cancel
                                </Button>
                                <Button type="submit" isLoading={savingEdit}>
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            <div
                className={`${showCreateForm ? "hidden" : "block"} bg-[#f4efea] pt-4 sm:hidden ${
                    mobileTab === "ANALYTICS" ? "min-h-screen pb-0" : "min-h-screen pb-28"
                }`}
            >
                <div className="px-4">
                    <button
                        type="button"
                        onClick={() => setShowCreateForm(true)}
                        className="mb-3 flex w-full items-center justify-between gap-3 rounded-[1.65rem] border border-[#ddd3cb] bg-[#fbf8f5] px-5 py-4 text-left"
                    >
                        <div>
                            <p className={`${cormorantHeading.className} text-[23px] font-semibold leading-[1.05] text-foreground`}>List New Item</p>
                            <p className="mt-1.5 text-[0.92rem] leading-[1.25] text-[#8a7667]">
                                {listingStats.activeCount} active · {listingStats.soldCount} sold · ${listingStats.listedValue.toLocaleString()} listed value
                            </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-[#8a7667]" />
                    </button>
                </div>

                <div className="overflow-x-auto border-b border-[#ddd3cb] bg-[#f7f2ed] px-8">
                    <div className="inline-flex min-w-max items-center gap-7 pt-2.5">
                        {mobileTabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setMobileTab(tab.key)}
                                className={`relative whitespace-nowrap pb-2 text-[0.93rem] ${
                                    mobileTab === tab.key ? "font-semibold text-[#2f2925]" : "font-normal text-[#8a7667]"
                                }`}
                            >
                                {tab.label}
                                {mobileTab === tab.key ? (
                                    <span
                                        className="pointer-events-none absolute left-[8px] right-[8px] h-[2px] rounded-full bg-[#4a3328]"
                                        style={{ bottom: 0 }}
                                    />
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>

                {mobileTab !== "ANALYTICS" ? (
                    <div className="px-4 pt-4">
                        <h2
                            ref={mobileMyListingsRef}
                            className={`${cormorantHeading.className} mb-4 text-[23px] font-medium leading-[1.05] text-foreground`}
                        >
                            My Listings
                        </h2>
                    </div>
                ) : null}
                {error ? (
                    <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                {mobileTab === "ANALYTICS" ? (
                    <div className="px-4 pb-4 pt-4">
                        <h3 className={`${cormorantHeading.className} mb-4 text-[23px] font-medium leading-[1.05] text-[#2f2925]`}>
                            Analytics
                        </h3>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Total Listings</p>
                                <p className={`${cormorantHeading.className} mt-1.5 text-[2rem] leading-none text-[#2f2925]`}>{analytics.totalListings}</p>
                                <p className="mt-1 text-[0.88rem] text-[#8a7667]">All time</p>
                            </div>
                            <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Revenue</p>
                                <p className={`${cormorantHeading.className} mt-1.5 text-[2rem] leading-none text-[#2f2925]`}>
                                    ${analytics.deliveredRevenue.toFixed(2)}
                                </p>
                                <p className="mt-1 text-[0.88rem] text-[#8a7667]">From sold</p>
                            </div>
                            <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Active</p>
                                <p className={`${cormorantHeading.className} mt-1.5 text-[2rem] leading-none text-[#2f2925]`}>{analytics.activeListings}</p>
                                <p className="mt-1 text-[0.88rem] text-[#8a7667]">Live now</p>
                            </div>
                            <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Avg Price</p>
                                <p className={`${cormorantHeading.className} mt-1.5 text-[2rem] leading-none text-[#2f2925]`}>
                                    ${analytics.averagePrice.toFixed(2)}
                                </p>
                                <p className="mt-1 text-[0.88rem] text-[#8a7667]">All listings</p>
                            </div>
                        </div>

                        <div className="mt-3 rounded-[1.6rem] border border-[#e3dbd3] bg-[#f8f3ee] px-4 py-[12px]">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a7667]">Status Breakdown</p>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                <span className="inline-flex rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-[10px] py-[3px] text-[0.83rem] text-[#5f4a3c]">
                                    Active: {analytics.activeListings}
                                </span>
                                <span className="inline-flex rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-[10px] py-[3px] text-[0.83rem] text-[#5f4a3c]">
                                    Sold: {analytics.soldListings}
                                </span>
                                <span className="inline-flex rounded-full border border-[#ddd3cb] bg-[#fbf8f5] px-[10px] py-[3px] text-[0.83rem] text-[#5f4a3c]">
                                    Pending: {analytics.pendingListings}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                <div className="space-y-3 px-4">
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
                                ? "bg-[#efe6dd] text-[#6f5647]"
                                : isRejected
                                    ? "bg-red-100 text-red-700"
                                    : "bg-yellow-100 text-yellow-700";
                            const label = isApproved ? (listing.status === "SOLD" ? "Sold" : "Active") : modStatus;

                            return (
                                <article key={listing.id} className="rounded-[1.45rem] border border-[#ddd3cb] bg-[#fbf8f5] p-3.5">
                                    <div className="grid grid-cols-[96px_1fr] gap-3">
                                        <Link
                                            href={`/listings/${listing.id}`}
                                            className="col-span-1"
                                            onClick={() => {
                                                if (listing.status === "SOLD") markSoldListingsViewed([listing.id]);
                                            }}
                                        >
                                            <div className="relative overflow-hidden rounded-[1.05rem] border border-[#e3d8cf] bg-[#f2ebe4]">
                                                <div className="relative aspect-[2/3]">
                                                    <Image src={listing.image_url} alt={listing.title} fill className="object-cover" sizes="110px" />
                                                </div>
                                            </div>
                                        </Link>
                                        <div className="min-w-0">
                                            <Link
                                                href={`/listings/${listing.id}`}
                                                className="block"
                                                onClick={() => {
                                                    if (listing.status === "SOLD") markSoldListingsViewed([listing.id]);
                                                }}
                                            >
                                                <h3 className="line-clamp-2 text-[1.04rem] leading-[1.2] font-semibold text-[#2f2925]">{listing.title}</h3>
                                                <p className="mt-1 truncate text-[0.8rem] text-[#8a7667]">
                                                    {listing.category || "Fashion"}
                                                    {listing.type ? ` · ${listing.type}` : ""}
                                                    {listing.size ? ` · Size ${listing.size}` : ""}
                                                    {listing.brand ? ` · ${listing.brand}` : ""}
                                                </p>
                                                <p className="mt-1.5 text-[0.98rem] leading-none font-semibold text-[#2f2925]">
                                                    ${Number(listing.price).toLocaleString()}
                                                </p>
                                            </Link>
                                            <div className="mt-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex rounded-full px-2.5 py-[3px] text-[0.8rem] font-medium ${statusClass}`}>
                                                        {label}
                                                    </span>
                                                    {isNewSoldListing(listing) ? (
                                                        <span className="inline-flex rounded-full bg-[#4a3328] px-2 py-[3px] text-[0.67rem] font-semibold uppercase tracking-[0.08em] text-white">
                                                            NEW
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="mt-2.5 flex items-center gap-2.5">
                                                {listing.status !== "SOLD" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditListing(listing)}
                                                        className="inline-flex h-8 items-center rounded-full border border-[#d7cdc4] bg-white px-3.5 text-[0.84rem] font-medium text-[#5f4a3c]"
                                                    >
                                                        Edit
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void handleDeleteListing(listing.id);
                                                    }}
                                                    disabled={deletingListingId === listing.id}
                                                    className="inline-flex h-8 items-center rounded-full border border-[#d7cdc4] bg-white px-3.5 text-[0.84rem] font-medium text-[#5f4a3c] disabled:opacity-50"
                                                >
                                                    {deletingListingId === listing.id ? "Deleting..." : "Delete"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {isRejected && listing.rejection_reason && (
                                        <p className="mt-2 text-sm text-red-600 font-medium">Reason: {listing.rejection_reason}</p>
                                    )}
                                    {listing.label_url && (
                                        <div className="mt-2">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                                                onClick={() => {
                                                    window.open(listing.label_url as string, "_blank", "noopener,noreferrer");
                                                }}
                                            >
                                                <PackagePlus className="h-4 w-4" />
                                                Print Shipping Label
                                            </button>
                                        </div>
                                    )}
                                </article>
                            );
                        })
                    )}
                </div>
                )}
            </div>

            <div className={`${showCreateForm ? "block" : "hidden"} bg-[#f4efea] px-4 py-6 sm:hidden`}>
                {renderCreateForm(true)}
            </div>

            <div className="hidden bg-[#f4efea] px-4 py-6 sm:block sm:px-6 lg:px-8">
                <div className="mx-auto max-w-6xl space-y-8">
                    {renderCreateForm(false)}

                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2
                                ref={desktopMyListingsRef}
                                className={`${cormorantHeading.className} text-[23px] font-medium leading-[1.05] text-foreground`}
                            >
                                My Listings
                            </h2>
                            <Link href="/dashboard/sales">
                                <Button variant="outline" className="rounded-full">Manage Sales & Labels</Button>
                            </Link>
                        </div>

                        <div className="space-y-4">
                            {listings.length === 0 ? (
                                <div className="col-span-full rounded-[2rem] border border-dashed border-border py-20 text-center bg-card/40">
                                    <Tag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                                    <h3 className="text-xl font-serif font-bold text-foreground mb-2">No listings yet</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto">
                                        You haven&apos;t created any items for sale. Start by filling out the form above!
                                    </p>
                                </div>
                            ) : (
                                listings.map((listing) => {
                                    const modStatus = listing.moderation_status || "PENDING";
                                    const isApproved = modStatus === "APPROVED";
                                    const isRejected = modStatus === "REJECTED";
                                    const statusClass = isApproved
                                        ? "bg-[#e7ddd3] text-[#4a3328]"
                                        : isRejected
                                            ? "bg-red-100 text-red-700"
                                            : "bg-yellow-100 text-yellow-700";
                                    const label = isApproved ? (listing.status === "SOLD" ? "Sold" : "Active") : modStatus;

                                    return (
                                        <article key={listing.id} className="rounded-[1.6rem] border border-[#ddd3cb] bg-[#fbf8f5] p-4">
                                            <Link
                                                href={`/listings/${listing.id}`}
                                                className="grid grid-cols-[140px_1fr] gap-4"
                                                onClick={() => {
                                                    if (listing.status === "SOLD") markSoldListingsViewed([listing.id]);
                                                }}
                                            >
                                                <div className="relative overflow-hidden rounded-[1.05rem] border border-[#e3d8cf] bg-[#f2ebe4]">
                                                    <div className="relative aspect-[3/4]">
                                                        <Image src={listing.image_url} alt={listing.title} fill className="object-contain p-2" sizes="160px" />
                                                    </div>
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="line-clamp-2 text-[1.9rem] leading-[1.12] font-semibold text-[#2f2925]">{listing.title}</h3>
                                                    <p className="mt-1 truncate text-[1.02rem] text-[#8a7667]">
                                                        {listing.category || "Fashion"}
                                                        {listing.type ? ` · ${listing.type}` : ""}
                                                        {listing.size ? ` · Size ${listing.size}` : ""}
                                                        {listing.brand ? ` · ${listing.brand}` : ""}
                                                    </p>
                                                    <p className="mt-2 text-[2rem] leading-none font-semibold text-[#2f2925]">
                                                        ${Number(listing.price).toLocaleString()}
                                                    </p>
                                                    <div className="mt-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex rounded-full px-3 py-1 text-[0.95rem] font-semibold ${statusClass}`}>
                                                                {label}
                                                            </span>
                                                            {isNewSoldListing(listing) ? (
                                                                <span className="inline-flex rounded-full bg-[#4a3328] px-2.5 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-white">
                                                                    NEW
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>

                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                {listing.status !== "SOLD" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditListing(listing)}
                                                        className="inline-flex h-10 items-center rounded-full border border-[#ddd3cb] bg-white px-4 text-[0.96rem] text-[#4a3328]"
                                                    >
                                                        Edit
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteListing(listing.id)}
                                                    disabled={deletingListingId === listing.id}
                                                    className="inline-flex h-10 items-center rounded-full border border-[#ddd3cb] bg-white px-4 text-[0.96rem] text-[#4a3328] disabled:opacity-50"
                                                >
                                                    {deletingListingId === listing.id ? "Deleting..." : "Delete"}
                                                </button>
                                                {listing.label_url ? (
                                                    <a
                                                        href={listing.label_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex h-10 items-center gap-2 rounded-full border border-[#ddd3cb] bg-white px-4 text-[0.96rem] text-[#4a3328]"
                                                    >
                                                        <Printer className="h-4 w-4" />
                                                        Print Label
                                                    </a>
                                                ) : null}
                                            </div>
                                        </article>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
