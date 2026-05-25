"use client";

import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { useEffect, useMemo, useRef, useState } from "react";
import { createListing, deleteListing, replaceListingImages, updateListing } from "../actions/listings";
import { onboardSellerAction } from "../actions/stripe";
import { Tag, UploadCloud, ChevronLeft, ChevronRight, Heart, PackagePlus, X, Printer, TrendingUp, Users, ShieldCheck, CreditCard, Sparkles } from "lucide-react";
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
type SlotRole = "fullOutfit" | "top" | "bottom" | "dupatta" | "closeup";
const SLOTS: Array<{ key: SlotRole; label: string; optional?: boolean; subtitle?: string }> = [
    { key: "fullOutfit", label: "Full Outfit", subtitle: "Show the complete look clearly." },
    { key: "top", label: "Top", optional: true, subtitle: "Show the top or upper part." },
    { key: "bottom", label: "Bottom", optional: true, subtitle: "Show the bottom or lower part." },
    { key: "dupatta", label: "Accessories", optional: true, subtitle: "Add scarves, dupatta, purse, belt, jewelry or any add-ons." },
    { key: "closeup", label: "Close-Up", optional: true, subtitle: "Show fabric texture, embellishments or stitching." },
];
const orderedSlotFiles = (slots: Partial<Record<SlotRole, File>>): File[] =>
    SLOTS.map((s) => slots[s.key]).filter((f): f is File => Boolean(f));
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
    const [slotFiles, setSlotFiles] = useState<Partial<Record<SlotRole, File>>>({});
    const [slotPreviewUrls, setSlotPreviewUrls] = useState<Partial<Record<SlotRole, string>>>({});
    const [activeUploadSlot, setActiveUploadSlot] = useState<SlotRole | null>(null);
    const [isUploadAreaExpanded, setIsUploadAreaExpanded] = useState(false);
    const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [mobileTab, setMobileTab] = useState<SellTab>("LISTINGS");
    const [showCreateForm, setShowCreateForm] = useState(openCreateInitially);
    const [editingListing, setEditingListing] = useState<ListingItem | null>(null);
    const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editFiles, setEditFiles] = useState<File[]>([]);
    const [editPreviewUrls, setEditPreviewUrls] = useState<string[]>([]);
    const [title, setTitle] = useState("");
    const [price, setPrice] = useState("");
    const [brand, setBrand] = useState("");
    const [description, setDescription] = useState("");
    const [condition, setCondition] = useState("");
    const [size, setSize] = useState("");
    const [measurements, setMeasurements] = useState("");
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
    const [isOptimizing, setIsOptimizing] = useState(false);
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

    useEffect(() => {
        try {
            const draft = window.localStorage.getItem(`modaire_listing_draft:${currentUserId}`);
            if (draft) {
                const parsed = JSON.parse(draft);
                if (parsed.title) setTitle(parsed.title);
                if (parsed.style) setStyle(parsed.style);
                if (parsed.category) setCategory(parsed.category);
                if (parsed.subcategory) setSubcategory(parsed.subcategory);
                if (parsed.listingType) setListingType(parsed.listingType);
                if (parsed.price) setPrice(parsed.price);
                if (parsed.brand) setBrand(parsed.brand);
                if (parsed.description) setDescription(parsed.description);
                if (parsed.condition) setCondition(parsed.condition);
                if (parsed.size) setSize(parsed.size);
                if (parsed.measurements) setMeasurements(parsed.measurements);
                if (Array.isArray(parsed.generatedImageUrls)) setGeneratedImageUrls(parsed.generatedImageUrls);
            }
        } catch (e) {
            console.error("Failed to load draft listing", e);
        }
    }, [currentUserId]);

    useEffect(() => {
        const draft = {
            title,
            style,
            category,
            subcategory,
            listingType,
            price,
            brand,
            description,
            condition,
            size,
            measurements,
            generatedImageUrls,
        };
        const hasData = Object.keys(draft)
            .filter(k => k !== "generatedImageUrls")
            .some(k => (draft as any)[k] && (draft as any)[k].trim().length > 0) || generatedImageUrls.length > 0;
            
        if (hasData) {
            window.localStorage.setItem(`modaire_listing_draft:${currentUserId}`, JSON.stringify(draft));
        } else {
            window.localStorage.removeItem(`modaire_listing_draft:${currentUserId}`);
        }
    }, [title, style, category, subcategory, listingType, price, brand, description, condition, size, measurements, generatedImageUrls, currentUserId]);

    useEffect(() => {
        if (typeof window !== "undefined") {
            if (showCreateForm) {
                window.history.replaceState(null, "", "?create=1");
            } else {
                window.history.replaceState(null, "", "/sell");
            }
        }
    }, [showCreateForm]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isGenerating || loading) {
                e.preventDefault();
                e.returnValue = "Your listing or AI cover photo is currently being created. Are you sure you want to leave?";
                return e.returnValue;
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [isGenerating, loading]);

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
        setError("");
        const targetSlot = activeUploadSlot;
        if (files.length === 0 || !targetSlot) {
            e.target.value = "";
            setActiveUploadSlot(null);
            return;
        }

        const rawFile = files[0];

        setIsOptimizing(true);
        try {
            const file = await optimizeImageFile(rawFile);
            if (!COMPRESSIBLE_TYPES.has(file.type) && file.size > MAX_IMAGE_BYTES) {
                setError(`"${rawFile.name}" is larger than 10MB. Please choose a smaller file.`);
                return;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                setError(`"${rawFile.name}" is still larger than 10MB after optimization.`);
                return;
            }

            const candidateSlots = { ...slotFiles, [targetSlot]: file };
            const totalBytes = orderedSlotFiles(candidateSlots).reduce((sum, f) => sum + f.size, 0);
            if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
                setError("Total image upload size is too large. Please keep all images under 18MB combined.");
                return;
            }

            setSlotFiles(candidateSlots);
        } catch (err) {
            console.error("Optimization error:", err);
            setError("Failed to process images.");
        } finally {
            setIsOptimizing(false);
            setActiveUploadSlot(null);
            e.target.value = "";
        }
    };

    const removeSlot = (slot: SlotRole) => {
        setSlotFiles((prev) => {
            const next = { ...prev };
            delete next[slot];
            return next;
        });
    };

    const removeGeneratedImage = (indexToRemove: number) => {
        setGeneratedImageUrls((prev) => prev.filter((_, index) => index !== indexToRemove));
    };

    useEffect(() => {
        const urls: Partial<Record<SlotRole, string>> = {};
        for (const slot of SLOTS) {
            const file = slotFiles[slot.key];
            if (file) urls[slot.key] = URL.createObjectURL(file);
        }
        setSlotPreviewUrls(urls);
        return () => {
            Object.values(urls).forEach((url) => url && URL.revokeObjectURL(url));
        };
    }, [slotFiles]);

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
                        disabled={isGenerating}
                        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
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
                    const submissionFiles = orderedSlotFiles(slotFiles);
                    if (submissionFiles.length === 0) {
                        setError("Please upload at least one image.");
                        setLoading(false);
                        return;
                    }
                    submissionFiles.forEach((file) => formData.append("images", file));
                    const res = await createListing(formData);
                    if (res?.error) {
                        setError(res.error);
                    } else if (res?.success) {
                        // Successfully created! Close form and refresh listings
                        setShowCreateForm(false);
                        setSlotFiles({});
                        setGeneratedImageUrls([]);
                        setIsUploadAreaExpanded(false);
                        setStyle("");
                        setCategory("");
                        setSubcategory("");
                        setListingType("");
                        setTitle("");
                        setPrice("");
                        setBrand("");
                        setDescription("");
                        setCondition("");
                        setSize("");
                        setMeasurements("");
                        setTaxonomyErrors({});
                        window.localStorage.removeItem(`modaire_listing_draft:${currentUserId}`);
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

                    {generatedImageUrls.length > 0 && (
                        <div className="rounded-lg border border-border bg-card p-3">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">AI Cover</p>
                            <div className="flex flex-wrap gap-3">
                                {generatedImageUrls.map((url, index) => (
                                    <div key={`${url}-${index}`} className="relative w-40">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={url}
                                            alt={`AI cover ${index + 1}`}
                                            className="aspect-[2/3] w-full rounded-md object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeGeneratedImage(index)}
                                            aria-label="Remove AI cover"
                                            className="absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mb-6">
                        <h3 className="text-[20px] font-semibold text-[#4a3328]" style={{ fontFamily: "var(--font-serif), serif" }}>Add Photos</h3>
                        <p className="mt-1.5 text-[13px] text-[#8a7667]">
                            Add clear, well-lit photos to help your item sell faster.
                        </p>
                    </div>

                    <div className="relative">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                            {SLOTS.map((slot) => {
                                const file = slotFiles[slot.key];
                                const previewUrl = slotPreviewUrls[slot.key];
                                return (
                                    <div key={slot.key}>
                                        {file && previewUrl ? (
                                            <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-[#f2e7de] bg-[#fbf9f6] transition-all hover:shadow-sm">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={previewUrl}
                                                    alt={slot.label}
                                                    className="h-full w-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-black/5" />
                                                <button
                                                    type="button"
                                                    onClick={() => removeSlot(slot.key)}
                                                    aria-label={`Remove ${slot.label}`}
                                                    className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#fbf9f6]/95 text-[#4a3328] shadow-sm backdrop-blur-[2px] transition-transform hover:scale-105 active:scale-95"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                                
                                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2.5 pt-6">
                                                    <p className="text-center text-[10px] font-semibold text-white uppercase tracking-wider">
                                                        {slot.label}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setActiveUploadSlot(slot.key);
                                                    fileInputRef.current?.click();
                                                }}
                                                className="flex aspect-[3/4] w-full flex-col items-center justify-center px-4 py-6 rounded-[20px] border border-[#f2e7de] bg-[#fbf9f6] text-center transition-all hover:bg-[#f6efe7] hover:border-[#ebdccf]"
                                            >
                                                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-[#f2e7de] bg-white shrink-0">
                                                    {slot.key === "fullOutfit" && (
                                                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-[#7a6050]" fill="none" stroke="currentColor" strokeWidth="1.2">
                                                            <path d="M12 2a2 2 0 0 1 2 2c0 .6-.3 1.1-.7 1.3L16 7H8l2.7-1.7C10.3 5.1 10 4.6 10 4a2 2 0 0 1 2-2z" strokeLinecap="round" strokeLinejoin="round"/>
                                                            <path d="M8 7l1.5 5.5L7 21h10l-2.5-8.5L16 7H8z" strokeLinecap="round" strokeLinejoin="round"/>
                                                            <path d="M9.5 12.5h5" strokeLinecap="round"/>
                                                        </svg>
                                                    )}
                                                    {slot.key === "top" && (
                                                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-[#7a6050]" fill="none" stroke="currentColor" strokeWidth="1.2">
                                                            <path d="M9 4a3 3 0 0 1 6 0h4v4l-2.5 1.5L17 19H7l.5-9.5L5 8V4h4z" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                    )}
                                                    {slot.key === "bottom" && (
                                                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-[#7a6050]" fill="none" stroke="currentColor" strokeWidth="1.2">
                                                            <path d="M6 3h12l1 6-2 11h-3.5L12 9.5 10.5 20H7L5 9l1-6z" strokeLinecap="round" strokeLinejoin="round"/>
                                                            <path d="M7 6c.5.5 1 .5 1.5 0M15.5 6c.5.5 1 .5 1.5 0" strokeLinecap="round"/>
                                                        </svg>
                                                    )}
                                                    {slot.key === "dupatta" && (
                                                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-[#7a6050]" fill="none" stroke="currentColor" strokeWidth="1.2">
                                                            <path d="M9 7a3 3 0 0 1 6 0" strokeLinecap="round" strokeLinejoin="round"/>
                                                            <rect x="5" y="7" width="14" height="11" rx="3" strokeLinecap="round" strokeLinejoin="round"/>
                                                            <path d="M11 11h2v2h-2z" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                    )}
                                                    {slot.key === "closeup" && (
                                                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-[#7a6050]" fill="none" stroke="currentColor" strokeWidth="1.2">
                                                            <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" strokeDasharray="3 2" strokeLinecap="round" strokeLinejoin="round"/>
                                                            <path d="M8 8h8M8 12h8M8 16h8M10 6v12M14 6v12" strokeWidth="0.8" opacity="0.6" strokeLinecap="round"/>
                                                        </svg>
                                                    )}
                                                </div>
                                                
                                                <h4 className="text-[14px] font-semibold text-[#2f2925] leading-tight">
                                                    {slot.label}
                                                    {slot.optional && (
                                                        <span className="ml-1 text-[10.5px] font-normal text-[#8a7667]">(optional)</span>
                                                    )}
                                                </h4>
                                                
                                                <p className="mt-1 text-[11px] text-[#8a7667] leading-snug max-w-[130px] mx-auto">
                                                    {slot.subtitle}
                                                </p>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                {orderedSlotFiles(slotFiles).length} photos uploaded · up to 5
                            </p>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 rounded-[20px] border border-[#e8ddd1] bg-[#faf6f0] p-4">
                            <div className="flex items-start gap-3">
                                <Sparkles className="mt-0.5 h-4.5 w-4.5 flex-shrink-0 text-[#cfb79f]" />
                                <div>
                                    <p className="text-xs font-semibold text-[#4a3328]">Generate an AI cover photo</p>
                                    <p className="mt-0.5 text-[11px] text-[#8a7667] leading-normal">
                                        {generatedImageUrls.length > 0 
                                            ? "AI cover photo generated! Limit: 1 generated cover per listing." 
                                            : "Creates a studio-quality cover from your uploaded photos (takes 2-4 minutes). Limit: 1 generated cover per listing."}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={async () => {
                                    if (generatedImageUrls.length > 0) {
                                        setError("You have already generated an AI cover photo for this listing.");
                                        return;
                                    }
                                    const filledSlots = SLOTS.filter((s) => slotFiles[s.key]);
                                    if (filledSlots.length === 0) {
                                        setError("Please upload at least one product photo first before generating a cover.");
                                        return;
                                    }
                                    try {
                                        setIsGenerating(true);
                                        setError("");
                                        const apiFormData = new FormData();
                                        filledSlots.forEach((slot) => {
                                            apiFormData.append(`reference_${slot.key}`, slotFiles[slot.key]!);
                                        });

                                        const res = await fetch("/api/ai/generate-cover", {
                                            method: "POST",
                                            body: apiFormData,
                                        });

                                        if (!res.ok) {
                                            let errorMsg = `Server error (Status ${res.status})`;
                                            try {
                                                const contentType = res.headers.get("content-type") || "";
                                                if (contentType.includes("application/json")) {
                                                    const data = await res.json();
                                                    errorMsg = data?.error || errorMsg;
                                                } else {
                                                    const text = await res.text();
                                                    if (text && !text.trim().startsWith("<")) {
                                                        errorMsg = text.slice(0, 150) || errorMsg;
                                                    }
                                                }
                                            } catch (parseErr) {
                                                console.error("Failed to parse error response:", parseErr);
                                            }
                                            setError(errorMsg);
                                            return;
                                        }

                                        const data = await res.json();
                                        if (data?.error) {
                                            setError(data.error);
                                            return;
                                        }

                                        const imageUrl = data.imageUrl || data.url;
                                        if (!imageUrl) {
                                            setError("Image generation returned no URL.");
                                            return;
                                        }
                                        setGeneratedImageUrls([imageUrl]);
                                    } catch (err) {
                                        console.error("AI generate error:", err);
                                        setError(err instanceof Error ? err.message : "Failed to generate image.");
                                    } finally {
                                        setIsGenerating(false);
                                    }
                                }}
                                disabled={isGenerating || orderedSlotFiles(slotFiles).length === 0 || generatedImageUrls.length > 0}
                                isLoading={isGenerating}
                                className="w-full bg-white hover:bg-[#faf6f0] border-[#cfb79f] text-[#7a6050] hover:text-[#4a3328]"
                            >
                                {isGenerating ? "Generating…" : "Generate Cover"}
                            </Button>
                        </div>

                        {isOptimizing && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px]">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                                <p className="mt-3 text-xs font-medium text-foreground">Optimizing photo...</p>
                            </div>
                        )}

                        {isGenerating && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/85 backdrop-blur-[2px] p-6 text-center">
                                <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#cfb79f]/20 border-t-[#cfb79f]" />
                                <p className="mt-3 text-sm font-semibold text-foreground">AI Studio active...</p>
                                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed max-w-[240px] mx-auto">
                                    Generating cover photo. Feel free to fill in the item details below!
                                </p>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="absolute w-0 h-0 opacity-0 pointer-events-none"
                        />
                        {generatedImageUrls.map((url, index) => (
                            <input key={`${url}-${index}`} type="hidden" name="generatedImageUrls" value={url} />
                        ))}
                    </div>
                </section>

                <section className="space-y-6">
                    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Item Details
                    </h2>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" name="title" required placeholder="e.g., Silk Floral Abaya" className="h-12" value={title} onChange={(e) => setTitle(e.target.value)} />
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
                            <Input id="price" name="price" type="number" step="0.01" min="0.50" required placeholder="0.00" className="h-12" value={price} onChange={(e) => setPrice(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="brand">Brand</Label>
                            <Input id="brand" name="brand" placeholder="e.g., Luxury Modest" className="h-12" value={brand} onChange={(e) => setBrand(e.target.value)} />
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
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="condition">Condition</Label>
                            <select
                                id="condition"
                                name="condition"
                                value={condition}
                                onChange={(e) => setCondition(e.target.value)}
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
                                    value={size}
                                    onChange={(e) => setSize(e.target.value)}
                                >
                                    <option value="">Select Size</option>
                                    <option value="X-Small">X-Small</option>
                                    <option value="Small">Small</option>
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
                                    value={measurements}
                                    onChange={(e) => setMeasurements(e.target.value)}
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
                        disabled={!taxonomyValidation.ok || loading || isGenerating}
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
                title: "Keep 85% of your sale",
                desc: "Only a 15% platform fee, designed for modest fashion sellers.",
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
                                            <option value="Small">Small</option>
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

            {isGenerating && (
                <>
                    {/* Top Header Blocker */}
                    <div 
                        className="fixed top-0 left-0 right-0 h-24 z-[9999] cursor-not-allowed bg-black/5 backdrop-blur-[2px] flex items-center justify-center border-b border-border/40"
                        title="Please wait for AI cover generation to complete before leaving"
                    >
                        <span className="bg-background/95 border border-border px-3 py-1 rounded-full text-[10px] font-semibold text-primary shadow-sm tracking-wider uppercase">
                            AI Cover Studio Active • Navigation Blocked
                        </span>
                    </div>

                    {/* Bottom Tab Bar Blocker */}
                    <div 
                        className="fixed bottom-0 left-0 right-0 h-24 z-[9999] cursor-not-allowed bg-black/5 backdrop-blur-[2px] flex items-center justify-center border-t border-border/40"
                        title="Please wait for AI cover generation to complete before leaving"
                    >
                        <span className="bg-background/95 border border-border px-3 py-1 rounded-full text-[10px] font-semibold text-primary shadow-sm tracking-wider uppercase">
                            AI Cover Studio Active • Navigation Blocked
                        </span>
                    </div>
                </>
            )}

            {loading && (
                <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-[4px]">
                    <div className="max-w-xs w-[80%] bg-background border border-border p-6 rounded-xl shadow-2xl text-center space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary/20 border-t-primary mx-auto" />
                        <div className="space-y-1">
                            <h3 className="font-semibold text-foreground">Publishing Listing...</h3>
                            <p className="text-xs text-muted-foreground">Uploading images and securing your database record.</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
