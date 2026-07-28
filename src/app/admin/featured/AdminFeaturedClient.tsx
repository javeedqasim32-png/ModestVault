"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { GripVertical, X, Star } from "lucide-react";
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
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { setFeaturedListingsOrder } from "@/app/actions/admin";

type FeaturedItem = {
    id: string;
    title: string;
    price: number;
    image_url: string;
    seller_name: string;
};

const HOME_RAIL_SIZE = 8;

export default function AdminFeaturedClient({ initialItems }: { initialItems: FeaturedItem[] }) {
    const [items, setItems] = useState<FeaturedItem[]>(initialItems);
    const [pending, startTransition] = useTransition();
    const [saveMessage, setSaveMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

    // Pointer: 8px of movement before drag starts, so a normal click on the
    // Remove button doesn't accidentally trigger a drag. Touch: 500ms hold
    // before drag starts, so a mobile user can still scroll the list without
    // hijacking it into a drag.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const [savedIds, setSavedIds] = useState<string[]>(() => initialItems.map((i) => i.id));
    const isDirty =
        items.length !== savedIds.length ||
        items.some((item, index) => item.id !== savedIds[index]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setItems((prev) => {
            const oldIndex = prev.findIndex((i) => i.id === active.id);
            const newIndex = prev.findIndex((i) => i.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    };

    const remove = (id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
    };

    const handleSave = () => {
        setSaveMessage(null);
        startTransition(async () => {
            try {
                const orderedIds = items.map((i) => i.id);
                const res = await setFeaturedListingsOrder(orderedIds);
                if (res?.success) {
                    setSavedIds(orderedIds);
                    setSaveMessage({ kind: "ok", text: "Saved. Home rail is updated." });
                } else {
                    setSaveMessage({ kind: "err", text: "Save failed. Please try again." });
                }
            } catch (err) {
                console.error("Save featured order failed:", err);
                setSaveMessage({
                    kind: "err",
                    text: err instanceof Error ? err.message : "Save failed. Please try again.",
                });
            }
        });
    };

    return (
        <div>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                    <h1 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">Featured Listings</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The top {HOME_RAIL_SIZE} below appear on the Home page Featured rail, in this order.
                        Use the grip handle on the left of each row to drag it into a new position.
                    </p>
                </div>
                <div className="flex items-center justify-end gap-3">
                    {saveMessage ? (
                        <span
                            className={`text-sm ${saveMessage.kind === "ok" ? "text-green-700" : "text-red-700"}`}
                        >
                            {saveMessage.text}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!isDirty || pending}
                        className="rounded-full bg-[#7a5a45] px-5 py-2 text-sm font-medium text-white hover:bg-[#684a38] disabled:bg-[#7a5a45]/40 disabled:cursor-not-allowed"
                    >
                        {pending ? "Saving…" : "Save order"}
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                    <Star className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                    <p className="mt-3 text-sm text-muted-foreground">
                        No featured listings yet. Use{" "}
                        <Link href="/admin/listings" className="text-primary underline">
                            Listings
                        </Link>{" "}
                        to feature some.
                    </p>
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={items.map((i) => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <ul className="space-y-2">
                            {items.map((item, index) => (
                                <SortableFeaturedRow
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    onHomeRail={index < HOME_RAIL_SIZE}
                                    onRemove={remove}
                                />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}

type SortableFeaturedRowProps = {
    item: FeaturedItem;
    index: number;
    onHomeRail: boolean;
    onRemove: (id: string) => void;
};

function SortableFeaturedRow({ item, index, onHomeRail, onRemove }: SortableFeaturedRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 30 : "auto",
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-4 rounded-2xl border bg-card p-3 ${
                onHomeRail ? "border-border" : "border-dashed border-border/60 opacity-70"
            } ${isDragging ? "shadow-[0_12px_28px_rgba(0,0,0,0.18)]" : ""}`}
        >
            {/* Drag handle — only surface on the row that starts a drag.
                touchAction:none prevents the browser from claiming the touch
                as a page scroll before dnd-kit sees it. */}
            <button
                type="button"
                {...attributes}
                {...listeners}
                aria-label="Drag to reorder"
                title="Drag to reorder"
                style={{ touchAction: "none" }}
                className="inline-flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing"
            >
                <GripVertical className="h-5 w-5" />
            </button>

            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3eae3] text-sm font-semibold text-[#5f4437]">
                {index + 1}
            </span>

            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-[#f2ebe4]">
                {item.image_url ? (
                    <Image src={item.image_url} alt={item.title} fill className="object-cover" sizes="48px" />
                ) : null}
            </div>

            <div className="min-w-0 flex-1">
                <Link
                    href={`/listings/${item.id}`}
                    className="block truncate text-sm font-medium text-foreground hover:underline"
                >
                    {item.title}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                    {item.seller_name} · ${item.price.toLocaleString()}
                </p>
                {!onHomeRail ? (
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-amber-700">
                        Below top {HOME_RAIL_SIZE} — not visible on Home
                    </p>
                ) : null}
            </div>

            <button
                type="button"
                onClick={() => onRemove(item.id)}
                title="Remove from featured"
                aria-label="Remove from featured"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            >
                <X className="h-4 w-4" />
            </button>
        </li>
    );
}
