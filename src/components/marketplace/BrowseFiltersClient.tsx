"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getSubcategories, getTypes } from "@/lib/taxonomy";
import {
    hasActiveBrowseFilters,
    type ListingBrowseFilters,
    type ListingFilterOptionSets,
    toBrowseQueryString,
} from "@/lib/listingFilters";

type DropdownKey = "style" | "category" | "subcategory" | "type" | "size" | null;

const PRICE_MIN = 0;
const PRICE_MAX = 2000;
const PRICE_STEP = 25;

function sorted(values: string[]) {
    return [...values].sort((a, b) => a.localeCompare(b));
}

function toggleInArray(values: string[], value: string) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function PreviewChips({ items }: { items: string[] }) {
    const preview = items.slice(0, 2);
    const overflow = items.length - preview.length;

    if (items.length === 0) return <span className="text-muted-foreground">All</span>;

    return (
        <span className="flex items-center gap-1.5">
            {preview.map((item) => (
                <span key={item} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                    {item}
                </span>
            ))}
            {overflow > 0 ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">
                    +{overflow}
                </span>
            ) : null}
        </span>
    );
}

function MultiSelectDropdown({
    label,
    values,
    selected,
    open,
    onToggle,
    onChange,
}: {
    label: string;
    values: string[];
    selected: string[];
    open: boolean;
    onToggle: () => void;
    onChange: (next: string[]) => void;
}) {
    return (
        <div className="relative" data-dropdown-root="true">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground"
            >
                <span className="mr-2">{label}</span>
                <PreviewChips items={selected} />
            </button>
            {open ? (
                <div className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-border bg-card p-2 shadow-xl">
                    {values.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-muted-foreground">No options available</p>
                    ) : (
                        values.map((value) => {
                            const isSelected = selected.includes(value);
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => onChange(toggleInArray(selected, value))}
                                    className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${isSelected
                                        ? "bg-primary/10 text-primary"
                                        : "hover:bg-secondary"
                                        }`}
                                >
                                    {value}
                                </button>
                            );
                        })
                    )}
                </div>
            ) : null}
        </div>
    );
}

export default function BrowseFiltersClient({
    appliedFilters,
    availableOptions,
}: {
    appliedFilters: ListingBrowseFilters;
    availableOptions: ListingFilterOptionSets;
}) {
    const router = useRouter();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
    const normalizedAppliedFilters: ListingBrowseFilters = {
        search: appliedFilters?.search ?? "",
        styles: Array.isArray(appliedFilters?.styles) ? appliedFilters.styles : [],
        categories: Array.isArray(appliedFilters?.categories) ? appliedFilters.categories : [],
        subcategories: Array.isArray(appliedFilters?.subcategories) ? appliedFilters.subcategories : [],
        types: Array.isArray(appliedFilters?.types) ? appliedFilters.types : [],
        sizes: Array.isArray(appliedFilters?.sizes) ? appliedFilters.sizes : [],
        minPrice: typeof appliedFilters?.minPrice === "number" ? appliedFilters.minPrice : undefined,
        maxPrice: typeof appliedFilters?.maxPrice === "number" ? appliedFilters.maxPrice : undefined,
    };
    const normalizedAvailableOptions: ListingFilterOptionSets = {
        styles: Array.isArray(availableOptions?.styles) ? availableOptions.styles : [],
        categories: Array.isArray(availableOptions?.categories) ? availableOptions.categories : [],
        subcategories: Array.isArray(availableOptions?.subcategories) ? availableOptions.subcategories : [],
        types: Array.isArray(availableOptions?.types) ? availableOptions.types : [],
        sizes: Array.isArray(availableOptions?.sizes) ? availableOptions.sizes : [],
    };
    const [panelOpen, setPanelOpen] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);
    const [draft, setDraft] = useState<ListingBrowseFilters>(normalizedAppliedFilters);
    const [sliderMin, setSliderMin] = useState<number>(normalizedAppliedFilters.minPrice ?? PRICE_MIN);
    const [sliderMax, setSliderMax] = useState<number>(normalizedAppliedFilters.maxPrice ?? PRICE_MAX);

    const hasApplied = hasActiveBrowseFilters(normalizedAppliedFilters);
    const inventorySubcategories = useMemo(() => new Set(normalizedAvailableOptions.subcategories), [normalizedAvailableOptions.subcategories]);
    const inventoryTypes = useMemo(() => new Set(normalizedAvailableOptions.types), [normalizedAvailableOptions.types]);

    const subcategoryOptions = useMemo(() => {
        if (draft.categories.length === 0) return [];
        const fromTaxonomy = draft.categories.flatMap((category) => getSubcategories(category));
        return sorted([...new Set(fromTaxonomy)].filter((value) => inventorySubcategories.has(value)));
    }, [draft.categories, inventorySubcategories]);

    const typeOptions = useMemo(() => {
        const allowedSubcategories = draft.subcategories.filter((item) => item === "Shalwar Kameez");
        if (allowedSubcategories.length === 0) return [];
        const fromTaxonomy = allowedSubcategories.flatMap((subcategory) => getTypes(subcategory));
        return sorted([...new Set(fromTaxonomy)].filter((value) => inventoryTypes.has(value)));
    }, [draft.subcategories, inventoryTypes]);
    const minPercent = ((sliderMin - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
    const maxPercent = ((sliderMax - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;

    useEffect(() => {
        if (!panelOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (toggleButtonRef.current?.contains(target)) {
                return;
            }
            if (panelRef.current && !panelRef.current.contains(target)) {
                setPanelOpen(false);
                setOpenDropdown(null);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [panelOpen]);

    const applyFilters = () => {
        const next: ListingBrowseFilters = {
            ...draft,
            minPrice: sliderMin > PRICE_MIN ? sliderMin : undefined,
            maxPrice: sliderMax < PRICE_MAX ? sliderMax : undefined,
        };
        const query = toBrowseQueryString(next);
        setPanelOpen(false);
        setOpenDropdown(null);
        router.push(query ? `/browse?${query}` : "/browse");
    };

    const clearFilters = () => {
        setDraft({
            search: "",
            styles: [],
            categories: [],
            subcategories: [],
            types: [],
            sizes: [],
            minPrice: undefined,
            maxPrice: undefined,
        });
        setSliderMin(PRICE_MIN);
        setSliderMax(PRICE_MAX);
        setOpenDropdown(null);
    };

    const handlePanelClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (!target.closest("[data-dropdown-root='true']")) {
            setOpenDropdown(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/90 p-1.5">
                <div className="flex flex-1 items-center gap-3 rounded-full px-3 py-3">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <input
                        value={draft.search}
                        onChange={(event) => setDraft((prev) => ({ ...prev, search: event.target.value }))}
                        placeholder="Search listings..."
                        className="w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                </div>
                <button
                    ref={toggleButtonRef}
                    type="button"
                    onClick={() => {
                        setPanelOpen((prev) => !prev);
                        if (panelOpen) setOpenDropdown(null);
                    }}
                    className={`relative inline-flex items-center gap-2 rounded-full border px-4 py-3 text-base ${hasApplied
                        ? "border-[#8f6b52] bg-[#a07c61] text-white"
                        : "border-border/80 bg-[#f1ebe5] text-foreground"
                        }`}
                >
                    <SlidersHorizontal className="h-5 w-5" />
                    Filters
                </button>
            </div>

            {panelOpen ? (
                <div
                    ref={panelRef}
                    onClickCapture={handlePanelClickCapture}
                    className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Refine Results</h3>
                        <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                setPanelOpen(false);
                                setOpenDropdown(null);
                            }}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <MultiSelectDropdown
                            label="Style"
                            values={normalizedAvailableOptions.styles}
                            selected={draft.styles}
                            open={openDropdown === "style"}
                            onToggle={() => setOpenDropdown((prev) => (prev === "style" ? null : "style"))}
                            onChange={(next) => setDraft((prev) => ({ ...prev, styles: next }))}
                        />
                        <MultiSelectDropdown
                            label="Category"
                            values={normalizedAvailableOptions.categories}
                            selected={draft.categories}
                            open={openDropdown === "category"}
                            onToggle={() => setOpenDropdown((prev) => (prev === "category" ? null : "category"))}
                            onChange={(nextCategories) =>
                                setDraft((prev) => {
                                    const allowedSubcategories = sorted(
                                        [...new Set(nextCategories.flatMap((category) => getSubcategories(category)))]
                                            .filter((value) => inventorySubcategories.has(value))
                                    );
                                    const nextSubcategories = prev.subcategories.filter((item) => allowedSubcategories.includes(item));
                                    const allowedTypes = sorted(
                                        [...new Set(nextSubcategories.filter((item) => item === "Shalwar Kameez").flatMap((subcategory) => getTypes(subcategory)))]
                                            .filter((value) => inventoryTypes.has(value))
                                    );
                                    const nextTypes = prev.types.filter((item) => allowedTypes.includes(item));
                                    return {
                                        ...prev,
                                        categories: nextCategories,
                                        subcategories: nextSubcategories,
                                        types: nextTypes,
                                    };
                                })
                            }
                        />
                        {subcategoryOptions.length > 0 ? (
                            <MultiSelectDropdown
                                label="Subcategory"
                                values={subcategoryOptions}
                                selected={draft.subcategories}
                                open={openDropdown === "subcategory"}
                                onToggle={() => setOpenDropdown((prev) => (prev === "subcategory" ? null : "subcategory"))}
                                onChange={(nextSubcategories) =>
                                    setDraft((prev) => {
                                        const allowedTypes = sorted(
                                            [...new Set(nextSubcategories.filter((item) => item === "Shalwar Kameez").flatMap((subcategory) => getTypes(subcategory)))]
                                                .filter((value) => inventoryTypes.has(value))
                                        );
                                        const nextTypes = prev.types.filter((item) => allowedTypes.includes(item));
                                        return { ...prev, subcategories: nextSubcategories, types: nextTypes };
                                    })
                                }
                            />
                        ) : null}
                        {typeOptions.length > 0 ? (
                            <MultiSelectDropdown
                                label="Type"
                                values={typeOptions}
                                selected={draft.types}
                                open={openDropdown === "type"}
                                onToggle={() => setOpenDropdown((prev) => (prev === "type" ? null : "type"))}
                                onChange={(next) => setDraft((prev) => ({ ...prev, types: next }))}
                            />
                        ) : null}
                        <MultiSelectDropdown
                            label="Size"
                            values={normalizedAvailableOptions.sizes}
                            selected={draft.sizes}
                            open={openDropdown === "size"}
                            onToggle={() => setOpenDropdown((prev) => (prev === "size" ? null : "size"))}
                            onChange={(next) => setDraft((prev) => ({ ...prev, sizes: next }))}
                        />
                    </div>

                    <div className="mt-5">
                        <div className="mb-3 flex items-center justify-between px-1">
                            <p className="text-sm font-normal text-foreground">Price range</p>
                        </div>
                        <div className="rounded-[22px] border border-[#d8cdc4] bg-[#f8f3ef] p-3.5">
                            <div className="mb-4 flex items-center justify-between">
                                <span className="inline-flex min-h-[34px] items-center rounded-full border border-[#d8cdc4] bg-[#f8f3ef] px-3.5 text-sm font-normal text-muted-foreground">
                                    Min ${sliderMin}
                                </span>
                                <span className="inline-flex min-h-[34px] items-center rounded-full border border-[#d8cdc4] bg-[#f8f3ef] px-3.5 text-sm font-normal text-muted-foreground">
                                    Max ${sliderMax}
                                </span>
                            </div>

                            <div className="relative h-9">
                                <div
                                    className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full"
                                    style={{
                                        background: `linear-gradient(to right, #ded3cb 0%, #ded3cb ${minPercent}%, #a07c61 ${minPercent}%, #a07c61 ${maxPercent}%, #ded3cb ${maxPercent}%, #ded3cb 100%)`,
                                    }}
                                />
                                <input
                                    type="range"
                                    min={PRICE_MIN}
                                    max={PRICE_MAX}
                                    step={PRICE_STEP}
                                    value={sliderMin}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setSliderMin(Math.min(next, sliderMax));
                                    }}
                                    className="price-slider price-slider-min absolute left-0 top-0 h-9 w-full"
                                />
                                <input
                                    type="range"
                                    min={PRICE_MIN}
                                    max={PRICE_MAX}
                                    step={PRICE_STEP}
                                    value={sliderMax}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setSliderMax(Math.max(next, sliderMin));
                                    }}
                                    className="price-slider absolute left-0 top-0 h-9 w-full"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 flex items-center gap-2">
                        <Button onClick={applyFilters} className="rounded-full px-6">
                            Apply
                        </Button>
                        <Button variant="outline" onClick={clearFilters} className="rounded-full px-6">
                            Clear
                        </Button>
                    </div>
                </div>
            ) : null}
            <style jsx>{`
                .price-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    background: transparent;
                    pointer-events: none;
                }
                .price-slider::-webkit-slider-runnable-track {
                    height: 0;
                    background: transparent;
                    border: 0;
                }
                .price-slider::-moz-range-track {
                    height: 0;
                    background: transparent;
                    border: 0;
                }
                .price-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 22px;
                    height: 22px;
                    border-radius: 9999px;
                    background: #a07c61;
                    border: 3px solid #fff;
                    box-shadow: 0 2px 8px rgba(47, 41, 37, 0.2);
                    pointer-events: all;
                    cursor: pointer;
                    margin-top: -11px;
                }
                .price-slider::-moz-range-thumb {
                    width: 22px;
                    height: 22px;
                    border-radius: 9999px;
                    background: #a07c61;
                    border: 3px solid #fff;
                    box-shadow: 0 2px 8px rgba(47, 41, 37, 0.2);
                    pointer-events: all;
                    cursor: pointer;
                }
                .price-slider-min {
                    z-index: 2;
                }
            `}</style>
        </div>
    );
}
