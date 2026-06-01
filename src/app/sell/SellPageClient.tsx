"use client";

import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import SortableImageCard from "@/components/sell/SortableImageCard";
import { createListing, deleteListing, replaceListingImages, updateListing, getListingImages, uploadDraftPhotos, saveDraft, listMyDrafts, deleteDraft, clearDraftRecord, type DraftRecord } from "../actions/listings";
import { Tag, UploadCloud, ChevronLeft, ChevronRight, Heart, PackagePlus, X, Printer, TrendingUp, Users, ShieldCheck, CreditCard, Sparkles, Plus, GripHorizontal } from "lucide-react";
import EmptyBagIllustration from "@/components/ui/EmptyBagIllustration";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useRouter } from "next/navigation";
import { getCategories, getStyles, getSubcategories, getTypes } from "@/lib/taxonomy";
import { validateListingTaxonomy, type ListingTaxonomyErrors } from "@/lib/taxonomyValidation";
import { SKIN_TONE_OPTIONS, DEFAULT_SKIN_TONE, type SkinTone } from "@/lib/ai-cover-options";

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
    listings: ListingItem[];
    initialDrafts: DraftRecord[];
    openCreateInitially?: boolean;
    openManageInitially?: boolean;
    editListingIdInitially?: string | null;
    analytics: {
        totalListings: number;
        deliveredRevenue: number;
        activeListings: number;
        averagePrice: number;
        soldListings: number;
        pendingListings: number;
    };
};

type SellTab = "ACTIVE" | "PENDING" | "SOLD" | "DRAFT" | "INSIGHTS";
const mobileTabs: { key: SellTab; label: string }[] = [
    { key: "ACTIVE", label: "Active" },
    { key: "PENDING", label: "Pending" },
    { key: "SOLD", label: "Sold" },
    { key: "DRAFT", label: "Draft" },
    { key: "INSIGHTS", label: "Insights" },
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
const MAX_TOTAL_IMAGE_BYTES = 36 * 1024 * 1024;
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
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
    const regex = /(?:\r?\n){2}Measurements:\r?\n/i;
    const match = description.match(regex);
    if (!match || match.index === undefined) {
        return "";
    }
    const markerIndex = match.index;
    const markerLength = match[0].length;
    return description.slice(markerIndex + markerLength).trim();
}

function stripMeasurementsFromDescription(description: string) {
    const regex = /(?:\r?\n){2}Measurements:\r?\n/i;
    const match = description.match(regex);
    if (!match || match.index === undefined) {
        return description;
    }
    return description.slice(0, match.index).trimEnd();
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
    // 1. Attempt standard modern WebP format
    let blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((output) => resolve(output), "image/webp", quality);
    });

    // 2. Universal fallback to JPEG if WebP canvas encoding is unsupported (e.g. Safari on some iOS/macOS versions)
    if (!blob || blob.type !== "image/webp") {
        blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((output) => resolve(output), "image/jpeg", quality);
        });
    }

    if (!blob) {
        throw new Error("Failed to encode image canvas.");
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

        const qualitySteps = [0.85, 0.75, 0.65, 0.55];
        let bestBlob: Blob | null = null;
        for (const quality of qualitySteps) {
            const attempt = await canvasToWebpBlob(canvas, quality);
            bestBlob = attempt;
            if (attempt.size <= 2.5 * 1024 * 1024) {
                break;
            }
        }

        if (!bestBlob || bestBlob.size >= file.size) {
            return file;
        }

        const finalMime = bestBlob.type || "image/jpeg";
        const finalExt = finalMime === "image/jpeg" ? "jpg" : "webp";

        return new File(
            [bestBlob],
            replaceFileExtension(file.name || "upload", finalExt),
            { type: finalMime, lastModified: Date.now() }
        );
    } catch (error) {
        console.warn("Image optimization skipped:", error);
        return file;
    }
}

export default function SellPageClient({
    currentUserId,
    listings,
    initialDrafts,
    openCreateInitially = false,
    openManageInitially = false,
    editListingIdInitially = null,
    analytics,
}: SellPageClientProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [modelSkinTone, setModelSkinTone] = useState<SkinTone>(DEFAULT_SKIN_TONE);
    const [hijabRequired, setHijabRequired] = useState<boolean | null>(null);
    // Explicit "Save as Draft" state. `drafts` mirrors localStorage; `restoredPhotoUrls`
    // holds the S3 URLs of photos from a resumed draft (shown in the photo grid alongside
    // newly uploaded selectedFiles); `currentDraftId` tracks the draft being resumed so
    // we can clean it up if the seller publishes or saves again.
    const [drafts, setDrafts] = useState<DraftRecord[]>(initialDrafts);
    const [restoredPhotoUrls, setRestoredPhotoUrls] = useState<string[]>([]);
    const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    // Unified ordering for the create-form photo grid. Each entry is
    // "draft:<url>" (restored from a saved draft) or "new:<fileId>" (a fresh
    // upload). Drives both the grid render and the itemOrder we send to the
    // server, so draft photos and new uploads can be freely interleaved.
    const [createItemOrder, setCreateItemOrder] = useState<string[]>([]);
    // dnd-kit sensors: PointerSensor handles mouse, TouchSensor handles touch.
    // activationConstraint prevents accidental drags during a quick tap or while scrolling.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const getFileId = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;
    const [mobileTab, setMobileTab] = useState<SellTab>("ACTIVE");
    const [showCreateForm, setShowCreateForm] = useState(openCreateInitially);
    const [editingListing, setEditingListing] = useState<ListingItem | null>(null);
    const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editFiles, setEditFiles] = useState<File[]>([]);
    const [editPreviewUrls, setEditPreviewUrls] = useState<string[]>([]);
    const [existingImages, setExistingImages] = useState<{ id: string; imageUrl: string; thumbUrl?: string | null; mediumUrl?: string | null; imageOrder: number }[]>([]);
    // Unified ordering for the edit grid. Each entry is "existing:<imageId>" or
    // "new:<fileId>", matching ids in existingImages / editFiles. Drives both
    // the render order and the itemOrder we send to the server.
    const [editItemOrder, setEditItemOrder] = useState<string[]>([]);
    // Flips true the moment the user adds, removes, or reorders an image so
    // we know whether to call replaceListingImages on save. Pure text/taxonomy
    // edits skip that call and therefore skip re-moderation.
    const [editImagesChanged, setEditImagesChanged] = useState(false);
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

        if (mobileTab === "ACTIVE") return listings.filter((listing) => listing.moderation_status === "APPROVED" && listing.status !== "SOLD").sort(byCreatedDesc);
        if (mobileTab === "PENDING") return listings.filter((listing) => listing.moderation_status === "PENDING").sort(byCreatedDesc);
        if (mobileTab === "SOLD") return listings.filter((listing) => listing.status === "SOLD").sort(byUpdatedDesc);
        return [];
    }, [listings, mobileTab]);

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

    // Drafts are seeded from the server-rendered `initialDrafts` prop so the
    // list is correct on first paint. We still re-fetch on mount as a
    // cheap refresh in case another tab/device added or removed drafts since
    // this RSC payload was generated — but we only overwrite state if the
    // server action succeeded, so a transient auth race can't blank the list.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const result = await listMyDrafts();
            if (cancelled) return;
            if ("drafts" in result) setDrafts(result.drafts);
        })();
        return () => { cancelled = true; };
    }, [currentUserId]);

    useEffect(() => {
        try {
            const draft = window.sessionStorage.getItem(`modaire_listing_draft:${currentUserId}`);
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
            window.sessionStorage.setItem(`modaire_listing_draft:${currentUserId}`, JSON.stringify(draft));
        } else {
            window.sessionStorage.removeItem(`modaire_listing_draft:${currentUserId}`);
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

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        setError("");
        if (files.length === 0) return;

        // Cap is 5 NEW + restored photos combined; the AI cover takes the 6th
        // slot (MAX_LISTING_IMAGES on the server).
        const PHOTO_LIMIT = 5;
        const currentTotal = selectedFiles.length + restoredPhotoUrls.length;
        if (currentTotal >= PHOTO_LIMIT) {
            setError(`You can only upload up to ${PHOTO_LIMIT} photos.`);
            e.target.value = "";
            return;
        }

        setIsOptimizing(true);
        try {
            const newlyOptimized: File[] = [];
            for (const rawFile of files) {
                if (currentTotal + newlyOptimized.length >= PHOTO_LIMIT) {
                    setError(`Maximum ${PHOTO_LIMIT} photos allowed. Some files were skipped.`);
                    break;
                }

                const file = await optimizeImageFile(rawFile);
                if (!COMPRESSIBLE_TYPES.has(file.type) && file.size > MAX_IMAGE_BYTES) {
                    setError(`"${rawFile.name}" is larger than 10MB. Please choose a smaller file.`);
                    continue;
                }
                if (file.size > MAX_IMAGE_BYTES) {
                    setError(`"${rawFile.name}" is still larger than 10MB after optimization.`);
                    continue;
                }
                newlyOptimized.push(file);
            }

            const candidateFiles = [...selectedFiles, ...newlyOptimized];
            const totalBytes = candidateFiles.reduce((sum, f) => sum + f.size, 0);
            if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
                setError("Total image upload size is too large. Please keep all images under 18MB combined.");
                setIsOptimizing(false);
                e.target.value = "";
                return;
            }

            setSelectedFiles(candidateFiles);
            setCreateItemOrder((prev) => [
                ...prev,
                ...newlyOptimized.map((file) => `new:${getFileId(file)}`),
            ]);
        } catch (err) {
            console.error("Optimization error:", err);
            setError("Failed to process images.");
        } finally {
            setIsOptimizing(false);
            e.target.value = "";
        }
    };

    const removeImage = (indexToRemove: number) => {
        const removedFile = selectedFiles[indexToRemove];
        setSelectedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
        if (removedFile) {
            const removedId = `new:${getFileId(removedFile)}`;
            setCreateItemOrder((prev) => prev.filter((entry) => entry !== removedId));
        }
    };

    const moveImage = (index: number, direction: "left" | "right") => {
        const newIndex = direction === "left" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= selectedFiles.length) return;
        setSelectedFiles((prev) => {
            const next = [...prev];
            const temp = next[index];
            next[index] = next[newIndex];
            next[newIndex] = temp;
            return next;
        });
    };

    // dnd-kit drag end: reorder the unified createItemOrder so draft-restored
    // photos and new uploads can be freely interleaved.
    const handleSortEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setCreateItemOrder((prev) => {
            const oldIndex = prev.indexOf(String(active.id));
            const newIndex = prev.indexOf(String(over.id));
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    };

    const removeGeneratedImage = (indexToRemove: number) => {
        setGeneratedImageUrls((prev) => prev.filter((_, index) => index !== indexToRemove));
    };

    // Cache object URLs per-File so a reorder doesn't regenerate every URL
    // (which would change every React key and force unmount/remount of every
    // card mid-drag, breaking touch reordering).
    const fileUrlCacheRef = useRef<Map<File, string>>(new Map());
    useEffect(() => {
        const cache = fileUrlCacheRef.current;
        for (const file of selectedFiles) {
            if (!cache.has(file)) {
                cache.set(file, URL.createObjectURL(file));
            }
        }
        const urls = selectedFiles.map((file) => cache.get(file)!);
        setPreviewUrls(urls);

        // Revoke URLs for files that have been removed from selectedFiles
        const currentSet = new Set(selectedFiles);
        for (const [file, url] of cache.entries()) {
            if (!currentSet.has(file)) {
                URL.revokeObjectURL(url);
                cache.delete(file);
            }
        }
    }, [selectedFiles]);

    useEffect(() => {
        const urls = editFiles.map((file) => URL.createObjectURL(file));
        setEditPreviewUrls(urls);
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [editFiles]);

    // When arriving via /sell?manage=1 (e.g. the "Your Listings" card),
    // just ensure the create form is collapsed. The listings tabs are now
    // the top of the page, so no scrollIntoView is needed — that used to
    // jump past the old "List New Item" header and now would hide the Navbar.
    useEffect(() => {
        if (openManageInitially) setShowCreateForm(false);
    }, [openManageInitially]);

    // Deep-link from /listings/[id] (owner-only Edit button) → /sell?edit=<id>.
    // Auto-open the edit modal for the matching listing on mount.
    useEffect(() => {
        if (!editListingIdInitially) return;
        const target = listings.find((l) => l.id === editListingIdInitially);
        if (target) {
            setShowCreateForm(false);
            void startEditListing(target);
        }
        // Intentionally only on mount; we don't want re-open if the user later closes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length === 0) {
            e.target.value = "";
            return;
        }

        setIsOptimizing(true);
        try {
            const merged = [...editFiles];
            const newFileIds: string[] = [];
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
                newFileIds.push(`new:${getFileId(file)}`);
                if (existingImages.length + merged.length > MAX_IMAGES) {
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
            setEditItemOrder((prev) => [...prev, ...newFileIds]);
            if (newFileIds.length > 0) setEditImagesChanged(true);
            e.target.value = "";
        } finally {
            setIsOptimizing(false);
        }
    };

    const removeExistingImage = (idToRemove: string) => {
        setExistingImages((prev) => prev.filter((img) => img.id !== idToRemove));
        setEditItemOrder((prev) => prev.filter((entry) => entry !== `existing:${idToRemove}`));
        setEditImagesChanged(true);
    };

    const removeEditFileById = (fileId: string) => {
        setEditFiles((prev) => prev.filter((f) => getFileId(f) !== fileId));
        setEditItemOrder((prev) => prev.filter((entry) => entry !== `new:${fileId}`));
        setEditImagesChanged(true);
    };

    const handleEditSortEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setEditItemOrder((prev) => {
            const oldIndex = prev.indexOf(String(active.id));
            const newIndex = prev.indexOf(String(over.id));
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
        setEditImagesChanged(true);
    };

    // --- Explicit "Save as Draft" handlers ---

    const handleSaveAsDraft = async () => {
        if (isSavingDraft || loading) return;
        const hasContent =
            title.trim().length > 0 ||
            description.trim().length > 0 ||
            price.trim().length > 0 ||
            selectedFiles.length > 0 ||
            restoredPhotoUrls.length > 0 ||
            generatedImageUrls.length > 0;
        if (!hasContent) {
            setError("Add a title, description, photo, or other detail before saving as draft.");
            return;
        }

        setIsSavingDraft(true);
        setError("");
        try {
            // We need a draftId BEFORE uploading photos so they land under
            // the right S3 prefix. If we're resuming an existing draft, reuse
            // its id; otherwise generate one client-side.
            const draftId = currentDraftId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

            // Upload any new product photos to S3 under drafts/<userId>/<draftId>/
            let uploadedPhotoUrls: string[] = [];
            if (selectedFiles.length > 0) {
                const fd = new FormData();
                fd.set("draftId", draftId);
                selectedFiles.forEach((file) => fd.append("images", file));
                const result = await uploadDraftPhotos(fd);
                if (result?.error) {
                    setError(result.error);
                    return;
                }
                uploadedPhotoUrls = result.urls ?? [];
            }

            const saveResult = await saveDraft({
                id: currentDraftId ?? draftId,
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
                // Resumed-draft photos stay first, then any freshly uploaded ones.
                photoUrls: [...restoredPhotoUrls, ...uploadedPhotoUrls],
                generatedImageUrls,
            });
            if ("error" in saveResult) {
                setError(saveResult.error);
                return;
            }

            // Refresh the drafts list so the new/updated draft shows up.
            const refreshed = await listMyDrafts();
            if ("drafts" in refreshed) setDrafts(refreshed.drafts);

            // Reset the create form and clear the sessionStorage autosave —
            // the explicit draft is now the canonical store.
            window.sessionStorage.removeItem(`modaire_listing_draft:${currentUserId}`);
            resetCreateForm();
            setShowCreateForm(false);
            setMobileTab("DRAFT");
            // After the form closes the page collapses to the (shorter) Draft
            // tab content. Without this scroll-to-top the seller is left
            // looking at blank space below the new content.
            if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        } catch (err) {
            console.error("Save draft failed:", err);
            setError("Failed to save draft. Please try again.");
        } finally {
            setIsSavingDraft(false);
        }
    };

    const resetCreateForm = () => {
        setTitle("");
        setStyle("");
        setCategory("");
        setSubcategory("");
        setListingType("");
        setPrice("");
        setBrand("");
        setDescription("");
        setCondition("");
        setSize("");
        setMeasurements("");
        setSelectedFiles([]);
        setGeneratedImageUrls([]);
        setRestoredPhotoUrls([]);
        setCreateItemOrder([]);
        setCurrentDraftId(null);
        setHijabRequired(null);
        setModelSkinTone(DEFAULT_SKIN_TONE);
    };

    const handleResumeDraft = (draft: DraftRecord) => {
        setTitle(draft.title || "");
        setStyle(draft.style || "");
        setCategory(draft.category || "");
        setSubcategory(draft.subcategory || "");
        setListingType(draft.listingType || "");
        setPrice(draft.price || "");
        setBrand(draft.brand || "");
        setDescription(draft.description || "");
        setCondition(draft.condition || "");
        setSize(draft.size || "");
        setMeasurements(draft.measurements || "");
        setSelectedFiles([]);
        const photos = draft.photoUrls || [];
        setRestoredPhotoUrls(photos);
        setCreateItemOrder(photos.map((url) => `draft:${url}`));
        setGeneratedImageUrls(draft.generatedImageUrls || []);
        setCurrentDraftId(draft.id);
        setError("");
        setShowCreateForm(true);
    };

    const handleDeleteDraft = async (draftId: string) => {
        const confirmed = window.confirm("Delete this draft? Its saved photos will be removed too.");
        if (!confirmed) return;
        // Optimistically remove from UI; server cleanup deletes the DB row + S3 photos.
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
        try {
            const result = await deleteDraft(draftId);
            if ("error" in result) {
                console.error("Delete draft failed:", result.error);
                // Refresh from server to reconcile in case the optimistic delete was wrong.
                const refreshed = await listMyDrafts();
                if ("drafts" in refreshed) setDrafts(refreshed.drafts);
            }
        } catch (err) {
            console.error("Delete draft failed:", err);
        }
    };

    const handleRemoveRestoredPhoto = (urlToRemove: string) => {
        setRestoredPhotoUrls((prev) => prev.filter((url) => url !== urlToRemove));
        setCreateItemOrder((prev) => prev.filter((entry) => entry !== `draft:${urlToRemove}`));
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

    const startEditListing = async (listing: ListingItem) => {
        setEditingListing(listing);
        setEditFiles([]);
        setExistingImages([]);
        setEditItemOrder([]);
        setEditImagesChanged(false);
        setError("");
        setEditStyle(listing.style || "");
        setEditCategory(listing.category || "");
        setEditSubcategory(listing.subcategory || "");
        setEditListingType(listing.type || "");
        setEditTaxonomyErrors({});

        try {
            const images = await getListingImages(listing.id);
            setExistingImages(images);
            setEditItemOrder(images.map((img) => `existing:${img.id}`));
        } catch (err) {
            console.error("Failed to load listing images:", err);
        }
    };

    const closeEditListing = () => {
        setEditingListing(null);
        setEditFiles([]);
        setExistingImages([]);
        setEditItemOrder([]);
        setEditImagesChanged(false);
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
                    const submissionFiles = selectedFiles;
                    if (submissionFiles.length === 0 && restoredPhotoUrls.length === 0 && generatedImageUrls.length === 0) {
                        setError("Please upload at least one image.");
                        setLoading(false);
                        return;
                    }
                    submissionFiles.forEach((file) => formData.append("images", file));
                    // Photos restored from a resumed draft — server slots them in the
                    // listingImages array without re-uploading.
                    restoredPhotoUrls.forEach((url) => formData.append("keptDraftPhotoUrls", url));
                    // Send the explicit unified order so draft + new uploads keep
                    // the exact arrangement the seller dragged into.
                    const itemOrderPayload = createItemOrder
                        .map((entryId) => {
                            if (entryId.startsWith("draft:")) {
                                return { kind: "draft" as const, url: entryId.slice("draft:".length) };
                            }
                            const fileId = entryId.slice("new:".length);
                            const idx = submissionFiles.findIndex((f) => getFileId(f) === fileId);
                            return idx >= 0 ? { kind: "new" as const, index: idx } : null;
                        })
                        .filter((entry): entry is { kind: "draft"; url: string } | { kind: "new"; index: number } => entry !== null);
                    formData.append("itemOrder", JSON.stringify(itemOrderPayload));
                    const res = await createListing(formData);
                    if (res?.error) {
                        setError(res.error);
                    } else if (res?.success) {
                        // Successfully created! Close form, clear draft + autosave, refresh.
                        const publishedDraftId = currentDraftId;
                        resetCreateForm();
                        setShowCreateForm(false);
                        setTaxonomyErrors({});
                        window.sessionStorage.removeItem(`modaire_listing_draft:${currentUserId}`);
                        if (publishedDraftId) {
                            // Photos belong to the new listing now — keep them on S3, just drop the DB row.
                            void clearDraftRecord(publishedDraftId);
                            setDrafts((prev) => prev.filter((d) => d.id !== publishedDraftId));
                        }
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
                        <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>
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
                        {/* 1. Full-width dropzone only when there are no photos yet
                            (neither newly uploaded nor restored from a draft). */}
                        {createItemOrder.length === 0 && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex w-full flex-col items-center justify-center p-8 rounded-[28px] border border-dashed border-[#cfb79f] bg-[#fbf9f6] text-center transition-all hover:bg-[#f6efe7] hover:border-[#ebdccf] mb-6 cursor-pointer"
                            >
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#f2e7de] bg-white text-[#7a6050]">
                                    <UploadCloud className="h-6 w-6" />
                                </div>
                                <h4 className="text-[15px] font-semibold text-[#2f2925]">
                                    Upload Photos
                                </h4>
                                <p className="mt-1.5 text-xs text-[#8a7667] max-w-[280px]">
                                    Select up to 5 photos of your item. Drag and drop photos to rearrange their order.
                                </p>
                            </button>
                        )}

                        {/* 2. Unified DnD grid — restored draft photos + new uploads
                            share one SortableContext driven by createItemOrder so
                            sellers can freely interleave them. */}
                        {createItemOrder.length > 0 && (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSortEnd}>
                                <SortableContext items={createItemOrder} strategy={rectSortingStrategy}>
                                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 mb-6">
                                        {createItemOrder.map((entryId, index) => {
                                            const isDraft = entryId.startsWith("draft:");
                                            const url = isDraft
                                                ? entryId.slice("draft:".length)
                                                : previewUrls[selectedFiles.findIndex((f) => `new:${getFileId(f)}` === entryId)];
                                            if (!url) return null;
                                            return (
                                                <SortableImageCard
                                                    key={entryId}
                                                    id={entryId}
                                                    url={url}
                                                    index={index}
                                                    showCoverLabel={generatedImageUrls.length === 0}
                                                    onRemove={() => {
                                                        if (isDraft) {
                                                            handleRemoveRestoredPhoto(entryId.slice("draft:".length));
                                                        } else {
                                                            const fileIdx = selectedFiles.findIndex((f) => `new:${getFileId(f)}` === entryId);
                                                            if (fileIdx >= 0) removeImage(fileIdx);
                                                        }
                                                    }}
                                                />
                                            );
                                        })}

                                        {/* 'Add Photo' slot — capped at 5 total photos (draft + new combined). */}
                                        {createItemOrder.length < 5 && (
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex aspect-[3/4] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#cfb79f] bg-[#fbf9f6] hover:bg-[#f6efe7] hover:border-[#ebdccf] transition-all text-center cursor-pointer p-3"
                                            >
                                                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#f2e7de] bg-white text-[#7a6050] mb-2 shrink-0 shadow-sm">
                                                    <Plus className="h-5 w-5" />
                                                </div>
                                                <span className="text-[13px] font-semibold text-[#2f2925]">Add Photo</span>
                                                <span className="text-[10px] text-[#8a7667] mt-0.5">({5 - createItemOrder.length} left)</span>
                                            </button>
                                        )}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium text-[#7a6050]">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {createItemOrder.length} photos · Drag photos to rearrange
                            </p>
                        </div>

                        <div className="mt-5 flex flex-col gap-5 rounded-[20px] border border-[#e8ddd1] bg-[#faf6f0] p-5 sm:p-6">
                            <div className="flex items-start gap-3">
                                <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#cfb79f]" />
                                <div>
                                    <p className="text-sm font-semibold text-[#4a3328]">Generate an AI cover photo</p>
                                    <p className="mt-1 text-[12px] text-[#8a7667] leading-relaxed">
                                        {generatedImageUrls.length > 0
                                            ? "AI cover photo generated! Limit: 1 generated cover per listing."
                                            : "Create a studio-quality cover from your uploaded photos. Takes 2–4 minutes. Limit: 1 cover per listing."}
                                    </p>
                                </div>
                            </div>

                            <div className="border-t border-[#e8ddd1] pt-5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7667]">Model Tone</p>
                                <div className="mt-4 flex items-center justify-between px-1">
                                    {SKIN_TONE_OPTIONS.map((opt) => {
                                        const selected = modelSkinTone === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                aria-label={`Skin tone: ${opt.label}`}
                                                aria-pressed={selected}
                                                onClick={() => setModelSkinTone(opt.value)}
                                                className={`h-12 w-12 rounded-full transition ${selected ? "ring-[1.5px] ring-offset-[3px] ring-[#7a5a45] ring-offset-[#faf6f0]" : "ring-0"}`}
                                                style={{ backgroundColor: opt.swatch }}
                                            />
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="border-t border-[#e8ddd1] pt-5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7667]">Hijab</p>
                                <div className="mt-4 flex items-center gap-3">
                                    {[
                                        { label: "Yes", value: true },
                                        { label: "No", value: false },
                                    ].map((opt) => {
                                        const selected = hijabRequired === opt.value;
                                        return (
                                            <button
                                                key={opt.label}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => setHijabRequired(opt.value)}
                                                className={`min-w-[88px] rounded-full px-6 py-2.5 text-sm font-medium transition ${
                                                    selected
                                                        ? "bg-[#a89180] text-white"
                                                        : "border border-[#cfb79f] bg-white text-[#7a6050] hover:bg-[#faf6f0]"
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <Button
                                type="button"
                                onClick={async () => {
                                    if (generatedImageUrls.length > 0) {
                                        setError("You have already generated an AI cover photo for this listing.");
                                        return;
                                    }
                                    if (selectedFiles.length === 0) {
                                        setError("Please upload at least one product photo first before generating a cover.");
                                        return;
                                    }
                                    if (hijabRequired === null) {
                                        setError("Please choose whether the model wears a hijab.");
                                        return;
                                    }
                                    try {
                                        setIsGenerating(true);
                                        setError("");
                                        const apiFormData = new FormData();
                                        // Map the selectedFiles to sequential slots in order
                                        const mockSlots: SlotRole[] = ["fullOutfit", "top", "bottom", "dupatta", "closeup"];
                                        selectedFiles.forEach((file, index) => {
                                            if (index < mockSlots.length) {
                                                apiFormData.append(`reference_${mockSlots[index]}`, file);
                                            }
                                        });
                                        apiFormData.set("modelSkinTone", modelSkinTone);
                                        apiFormData.set("hijabRequired", String(hijabRequired));

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
                                disabled={isGenerating || selectedFiles.length === 0 || generatedImageUrls.length > 0 || hijabRequired === null}
                                isLoading={isGenerating}
                                className="w-full rounded-[28px] bg-[#5f4437] text-white hover:bg-[#4a3328] disabled:bg-[#5f4437]/40 disabled:text-white/80"
                            >
                                <span className="inline-flex items-center justify-center gap-2 uppercase tracking-[0.12em]">
                                    {isGenerating ? "Generating…" : "Generate Cover"}
                                    {!isGenerating ? <Sparkles className="h-4 w-4" strokeWidth={1.8} /> : null}
                                </span>
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
                                    Generating cover photo (takes 2-4 minutes). Feel free to fill in the item details below!
                                </p>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
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
                            <Label htmlFor="title" required>Title</Label>
                            <Input id="title" name="title" required placeholder="e.g., Silk Floral Abaya" className="h-12" value={title} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="style" required>Style</Label>
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
                                className="w-full h-12 border border-border bg-background px-4 text-sm rounded-[16px] focus:border-primary focus:outline-none transition-colors"
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
                            <Label htmlFor="category" required>Category</Label>
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
                                className="w-full h-12 border border-border bg-background px-4 text-sm rounded-[16px] focus:border-primary focus:outline-none transition-colors"
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
                                <Label htmlFor="subcategory" required>Subcategory</Label>
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
                                    className="w-full h-12 border border-border bg-background px-4 text-sm rounded-[16px] focus:border-primary focus:outline-none transition-colors"
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
                                <Label htmlFor="type" required>Type</Label>
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
                                    className="w-full h-12 border border-border bg-background px-4 text-sm rounded-[16px] focus:border-primary focus:outline-none transition-colors"
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
                            <Label htmlFor="price" required>Price ($)</Label>
                            <Input id="price" name="price" type="number" step="0.01" min="0.50" required placeholder="0.00" className="h-12" value={price} onChange={(e) => setPrice(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="brand">Brand</Label>
                            <Input id="brand" name="brand" placeholder="e.g., Luxury Modest" className="h-12" value={brand} onChange={(e) => setBrand(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" required>Description</Label>
                        <textarea
                            id="description"
                            name="description"
                            required
                            rows={5}
                            placeholder="Describe the texture, fit, and details of this piece..."
                            className="w-full border border-border bg-background p-4 text-sm rounded-[16px] focus:border-primary focus:outline-none transition-colors resize-none"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="condition" required>Condition</Label>
                            <select
                                id="condition"
                                name="condition"
                                required
                                value={condition}
                                onChange={(e) => setCondition(e.target.value)}
                                className="w-full h-12 border border-border bg-background px-4 text-sm rounded-[16px] focus:border-primary focus:outline-none transition-colors"
                            >
                                <option value="">Select Condition</option>
                                {["New with tags", "Like new", "Good", "Fair"].map(cond => (
                                    <option key={cond} value={cond}>{cond}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <div className="space-y-2">
                                <Label htmlFor="size" required>Size</Label>
                                <select
                                    id="size"
                                    name="size"
                                    required
                                    className="h-12 w-full border border-border bg-background px-4 text-sm rounded-[16px] focus:border-primary focus:outline-none transition-colors"
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
                                    className="w-full border border-border bg-background p-4 text-sm rounded-[16px] focus:border-primary focus:outline-none transition-colors resize-none"
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
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                        <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            disabled={loading || isGenerating || isSavingDraft}
                            isLoading={isSavingDraft}
                            onClick={() => { void handleSaveAsDraft(); }}
                            className="px-6 w-full sm:w-auto rounded-[28px]"
                        >
                            Save as Draft
                        </Button>
                        <Button
                            type="submit"
                            isLoading={loading}
                            size="lg"
                            disabled={!taxonomyValidation.ok || loading || isGenerating || isSavingDraft}
                            className="px-12 w-full sm:w-auto rounded-[28px]"
                        >
                            Publish Listing
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );

    return (
        <>
            {editingListing ? (
                <div className="fixed inset-0 z-[80] bg-black/45 p-4">
                    <div className="relative mx-auto mt-6 max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
                        {isOptimizing && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/70 backdrop-blur-[2px] rounded-[1.5rem]">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                                <p className="mt-3 text-xs font-medium text-foreground">Optimizing photo...</p>
                            </div>
                        )}
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

                                    // Only round-trip images (which re-queues moderation) when the user
                                    // actually added, removed, or reordered something. Pure text /
                                    // taxonomy edits leave moderation_status as-is.
                                    if (editImagesChanged) {
                                        const imageData = new FormData();
                                        imageData.append("keptImages", JSON.stringify(existingImages));
                                        editFiles.forEach((file) => imageData.append("images", file));
                                        const itemOrder = editItemOrder
                                            .map((entryId) => {
                                                if (entryId.startsWith("existing:")) {
                                                    return { kind: "existing" as const, id: entryId.slice("existing:".length) };
                                                }
                                                const fileId = entryId.slice("new:".length);
                                                const index = editFiles.findIndex((f) => getFileId(f) === fileId);
                                                return index >= 0 ? { kind: "new" as const, index } : null;
                                            })
                                            .filter((entry): entry is { kind: "existing"; id: string } | { kind: "new"; index: number } => entry !== null);
                                        imageData.append("itemOrder", JSON.stringify(itemOrder));

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
                                    <Label htmlFor="edit-title" required>Title</Label>
                                    <Input id="edit-title" name="title" required defaultValue={editingListing.title} />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="edit-price" required>Price ($)</Label>
                                    <Input id="edit-price" name="price" type="number" step="0.01" min="0.5" required defaultValue={Number(editingListing.price)} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <Label htmlFor="edit-style" required>Style</Label>
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
                                    <Label htmlFor="edit-category" required>Category</Label>
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
                                        <Label htmlFor="edit-subcategory" required>Subcategory</Label>
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
                                        <Label htmlFor="edit-type" required>Type</Label>
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
                                    <Label htmlFor="edit-condition" required>Condition</Label>
                                    <select
                                        id="edit-condition"
                                        name="condition"
                                        required
                                        defaultValue={editingListing.condition || ""}
                                        className="h-11 w-full rounded-[0.75rem] border border-border bg-background px-3 text-sm text-foreground"
                                    >
                                        <option value="">Select Condition</option>
                                        {["New with tags", "Like new", "Good", "Fair"].map(cond => (
                                            <option key={cond} value={cond}>{cond}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <div className="space-y-1">
                                        <Label htmlFor="edit-size" required>Size</Label>
                                        <select
                                            id="edit-size"
                                            name="size"
                                            required
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
                                <Label htmlFor="edit-description" required>Description</Label>
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
                                <Label htmlFor="edit-images">Listing Photos (max 6)</Label>
                                <input
                                    id="edit-images"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleEditImageChange}
                                    className="block w-full rounded-[0.75rem] border border-border bg-background p-2 text-sm"
                                    disabled={existingImages.length + editFiles.length >= 6}
                                />
                                {editItemOrder.length > 0 ? (
                                    <>
                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEditSortEnd}>
                                            <SortableContext items={editItemOrder} strategy={rectSortingStrategy}>
                                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                                    {editItemOrder.map((entryId, index) => {
                                                        const isExisting = entryId.startsWith("existing:");
                                                        const url = isExisting
                                                            ? existingImages.find((img) => `existing:${img.id}` === entryId)?.imageUrl
                                                            : editPreviewUrls[editFiles.findIndex((f) => `new:${getFileId(f)}` === entryId)];
                                                        if (!url) return null;
                                                        return (
                                                            <SortableImageCard
                                                                key={entryId}
                                                                id={entryId}
                                                                url={url}
                                                                index={index}
                                                                showCoverLabel={true}
                                                                onRemove={() => {
                                                                    if (isExisting) {
                                                                        removeExistingImage(entryId.slice("existing:".length));
                                                                    } else {
                                                                        removeEditFileById(entryId.slice("new:".length));
                                                                    }
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                        <p className="mt-3 text-xs text-muted-foreground">Drag photos to reorder. The first image is your cover.</p>
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
                className={`${showCreateForm ? "hidden" : "block"} bg-background pt-4 sm:hidden ${
                    mobileTab === "INSIGHTS" ? "min-h-screen pb-0" : "min-h-screen pb-28"
                }`}
            >
                <div className="border-b border-[#ddd3cb] bg-background px-7">
                    <div className="flex items-center justify-evenly pt-0">
                        {mobileTabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setMobileTab(tab.key)}
                                className={`relative whitespace-nowrap pb-2.5 text-[1.05rem] ${
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

                {mobileTab !== "INSIGHTS" && mobileTab !== "DRAFT" ? (
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

                {mobileTab === "INSIGHTS" ? (
                    <div className="px-4 pb-4 pt-4">
                        <h3 className={`${cormorantHeading.className} mb-4 text-[23px] font-medium leading-[1.05] text-[#2f2925]`}>
                            Insights
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
                ) : mobileTab === "DRAFT" ? (
                    <div className="px-4 pt-4">
                        <h2 className={`${cormorantHeading.className} mb-4 text-[23px] font-medium leading-[1.05] text-foreground`}>
                            Drafts
                        </h2>
                        {drafts.length === 0 ? (
                            <div className="rounded-[1.5rem] border border-dashed border-[#d4c7bb] bg-transparent px-6 py-16 text-center">
                                <div className="relative mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center">
                                    <EmptyBagIllustration size={56} />
                                </div>
                                <h3 className="text-[1.05rem] font-medium text-[#2f2925]">No drafts saved yet</h3>
                                <p className="mx-auto mt-2 max-w-xs text-sm text-[#8a7667]">
                                    Inside a new listing, tap <span className="font-semibold">Save as Draft</span> to come back later. Drafts sync across your devices.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {drafts.map((draft) => {
                                    const cover = draft.generatedImageUrls?.[0] || draft.photoUrls?.[0] || null;
                                    const savedDate = new Date(draft.savedAt);
                                    const photoCount = (draft.photoUrls?.length || 0) + (draft.generatedImageUrls?.length || 0);
                                    return (
                                        <article key={draft.id} className="rounded-[1.45rem] border border-[#ddd3cb] bg-[#fbf8f5] p-3.5">
                                            <div className="grid grid-cols-[96px_1fr] gap-3">
                                                <div className="relative overflow-hidden rounded-[1.05rem] border border-[#e3d8cf] bg-[#f2ebe4]">
                                                    <div className="relative aspect-[2/3]">
                                                        {cover ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={cover} alt={draft.title || "Draft photo"} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-[#a39082]">
                                                                <EmptyBagIllustration size={36} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="line-clamp-2 text-[1rem] font-semibold text-[#2f2925]">
                                                        {draft.title?.trim() || "Untitled draft"}
                                                    </p>
                                                    <p className="mt-1 text-[0.85rem] text-[#8a7667]">
                                                        {photoCount} {photoCount === 1 ? "photo" : "photos"} · saved {savedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                                    </p>
                                                    <div className="mt-3 flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleResumeDraft(draft)}
                                                            className="inline-flex h-9 items-center rounded-full bg-[#7a5a45] px-4 text-[13px] font-medium text-white hover:bg-[#684a38]"
                                                        >
                                                            Resume
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { void handleDeleteDraft(draft.id); }}
                                                            className="inline-flex h-9 items-center rounded-full border border-[#ddd3cb] bg-white px-4 text-[13px] text-[#5f4a3c] hover:bg-[#f4efea]"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                <div className="space-y-3 px-4">
                    {filteredListings.length === 0 ? (
                        <div className="rounded-[1.5rem] border border-dashed border-[#d4c7bb] bg-transparent px-6 py-20 text-center">
                            <div className="relative mx-auto mb-8 inline-flex h-20 w-20 items-center justify-center">
                                <EmptyBagIllustration size={72} />
                                <Sparkles className="absolute -top-1 -right-2 h-5 w-5 text-[#7a5a45]" strokeWidth={1.5} />
                                <Sparkles className="absolute -bottom-0 -left-3 h-3.5 w-3.5 text-[#7a5a45]" strokeWidth={1.5} />
                                <Sparkles className="absolute top-3 -right-5 h-2.5 w-2.5 text-[#7a5a45]" strokeWidth={1.8} />
                            </div>
                            <h3 className="text-[1.05rem] font-medium text-[#2f2925]">
                                {listings.length === 0 ? "You haven't listed anything yet." : "No listings in this tab yet."}
                            </h3>
                            <p className="mt-2 text-sm text-[#8a7667]">
                                {listings.length === 0 ? "List your first item to start selling." : "Try a different tab or add a new item."}
                            </p>
                            <button
                                type="button"
                                onClick={() => setShowCreateForm(true)}
                                className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#7a5a45] px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#684a38]"
                            >
                                <Plus className="h-4 w-4" />
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

                {mobileTab !== "INSIGHTS" && (
                    <button
                        type="button"
                        aria-label="Create new listing"
                        onClick={() => setShowCreateForm(true)}
                        className="fixed bottom-32 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#7a5a45] text-white shadow-[0_10px_24px_rgba(122,90,69,0.35)] transition-transform active:scale-95"
                    >
                        <Plus className="h-7 w-7" strokeWidth={2.2} />
                    </button>
                )}
            </div>

            <div className={`${showCreateForm ? "block" : "hidden"} bg-background px-4 py-6 sm:hidden`}>
                {renderCreateForm(true)}
            </div>

            <div className="hidden bg-background px-4 py-6 sm:block sm:px-6 lg:px-8">
                <div className="mx-auto max-w-6xl space-y-8">
                    {showCreateForm ? (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between border-b border-[#ddd3cb] pb-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateForm(false)}
                                    className="inline-flex items-center gap-2 rounded-full border border-[#ddd3cb] bg-white px-4 py-2 text-sm font-semibold text-[#4a3328] hover:bg-[#fbf8f5]"
                                >
                                    ← Back to Listings
                                </button>
                                <p className="text-sm text-muted-foreground font-semibold">New Listing Wizard</p>
                            </div>
                            {renderCreateForm(false)}
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Insights Summary Header */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#fbf8f5] px-6 py-5 shadow-sm">
                                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a7667] font-semibold">Total Listings</p>
                                    <p className={`${cormorantHeading.className} mt-2 text-[2.5rem] font-bold leading-none text-[#2f2925]`}>
                                        {analytics.totalListings}
                                    </p>
                                    <p className="mt-2 text-xs text-[#8a7667]">All time creations</p>
                                </div>
                                <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#fbf8f5] px-6 py-5 shadow-sm">
                                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a7667] font-semibold">Revenue</p>
                                    <p className={`${cormorantHeading.className} mt-2 text-[2.5rem] font-bold leading-none text-[#2f2925]`}>
                                        ${analytics.deliveredRevenue.toFixed(2)}
                                    </p>
                                    <p className="mt-2 text-xs text-[#8a7667]">Delivered orders</p>
                                </div>
                                <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#fbf8f5] px-6 py-5 shadow-sm">
                                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a7667] font-semibold">Active</p>
                                    <p className={`${cormorantHeading.className} mt-2 text-[2.5rem] font-bold leading-none text-[#2f2925]`}>
                                        {analytics.activeListings}
                                    </p>
                                    <p className="mt-2 text-xs text-[#8a7667]">Live on marketplace</p>
                                </div>
                                <div className="rounded-[1.6rem] border border-[#e3dbd3] bg-[#fbf8f5] px-6 py-5 shadow-sm">
                                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a7667] font-semibold">Avg Price</p>
                                    <p className={`${cormorantHeading.className} mt-2 text-[2.5rem] font-bold leading-none text-[#2f2925]`}>
                                        ${analytics.averagePrice.toFixed(2)}
                                    </p>
                                    <p className="mt-2 text-xs text-[#8a7667]">Average pricing</p>
                                </div>
                            </div>

                            {/* Header Section */}
                            <div className="flex items-center justify-between border-b border-[#ddd3cb] pb-5">
                                <div className="space-y-1">
                                    <h2 className={`${cormorantHeading.className} text-[32px] font-bold leading-none text-foreground`}>
                                        My Store Listings
                                    </h2>
                                    <p className="text-sm text-[#8a7667]">Manage, edit, or check the status of your listed items.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateForm(true)}
                                        className="inline-flex h-11 items-center gap-2 rounded-full bg-[#5f4437] px-6 text-sm font-semibold text-white hover:bg-[#4e372c] transition-colors shadow-md"
                                    >
                                        + List New Item
                                    </button>
                                    <Link href="/dashboard/sales">
                                        <Button variant="outline" className="rounded-full h-11 px-5">Manage Sales & Labels</Button>
                                    </Link>
                                </div>
                            </div>

                            {/* Desktop Tabs */}
                            <div className="flex border border-[#ddd3cb] bg-[#f7f2ed] p-1 rounded-xl">
                                {mobileTabs.filter(t => t.key !== "INSIGHTS").map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setMobileTab(tab.key)}
                                        className={`flex-1 py-2.5 text-center text-sm font-semibold rounded-lg transition-all ${
                                            mobileTab === tab.key
                                                ? "bg-[#2f2925] text-white shadow-sm"
                                                : "text-[#8a7667] hover:text-[#2f2925]"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Listings Grid/List */}
                            <div className="space-y-4">
                                {filteredListings.length === 0 ? (
                                    <div className="col-span-full rounded-[2rem] border border-dashed border-[#d4c7bb] bg-transparent px-6 py-24 text-center">
                                        <div className="relative mx-auto mb-8 inline-flex h-24 w-24 items-center justify-center">
                                            <EmptyBagIllustration size={88} />
                                            <Sparkles className="absolute -top-1 -right-2 h-6 w-6 text-[#7a5a45]" strokeWidth={1.5} />
                                            <Sparkles className="absolute -bottom-0 -left-4 h-4 w-4 text-[#7a5a45]" strokeWidth={1.5} />
                                            <Sparkles className="absolute top-4 -right-6 h-3 w-3 text-[#7a5a45]" strokeWidth={1.8} />
                                        </div>
                                        <h3 className="text-lg font-medium text-[#2f2925]">
                                            {listings.length === 0 ? "You haven't listed anything yet." : "No listings in this tab yet."}
                                        </h3>
                                        <p className="mt-2 text-sm text-[#8a7667] max-w-sm mx-auto">
                                            {listings.length === 0 ? "List your first item to start selling." : "Try a different tab or add a new item."}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setShowCreateForm(true)}
                                            className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#7a5a45] px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#684a38]"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Add your first item
                                        </button>
                                    </div>
                                ) : (
                                    filteredListings.map((listing) => {
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
                                            <article key={listing.id} className="rounded-[1.6rem] border border-[#ddd3cb] bg-[#fbf8f5] p-4 shadow-sm hover:shadow-md transition-all">
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

                                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
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
                                                {isRejected && listing.rejection_reason && (
                                                    <p className="mt-3 text-sm text-red-600 font-medium">Rejection Reason: {listing.rejection_reason}</p>
                                                )}
                                            </article>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
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
