"use client";

import { GripHorizontal, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Props = {
    id: string;
    url: string;
    index: number;
    showCoverLabel: boolean;
    onRemove: (index: number) => void;
    /**
     * When true, the card is in a read-only state: no remove button, no drag
     * handle, and no drag-to-reorder. Used while an AI cover generation is
     * in flight so the references actively being used by OpenAI can't be
     * mutated out from under the worker.
     */
    locked?: boolean;
};

const ROLE_LABELS = ["Full Outfit", "Top", "Bottom", "Accessories", "Close-up"] as const;

export default function SortableImageCard({ id, url, index, showCoverLabel, onRemove, locked = false }: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: locked });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 30 : "auto",
        touchAction: "none",
        WebkitTouchCallout: "none",
    };

    const isCoverCard = index === 0;
    const roleLabel =
        index === 0 ? (showCoverLabel ? "Cover · Full Outfit" : "Full Outfit") :
        index < ROLE_LABELS.length ? ROLE_LABELS[index] :
        "Additional";

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...(locked ? {} : attributes)}
            {...(locked ? {} : listeners)}
            className={`group relative aspect-[3/4] rounded-[24px] border p-1.5 flex flex-col justify-between bg-[#fbf9f6] select-none ${
                isCoverCard ? "border-[#cfb79f] ring-1 ring-[#cfb79f]/20" : "border-[#f2e7de]"
            } ${isDragging ? "shadow-[0_12px_28px_rgba(0,0,0,0.18)]" : ""}`}
        >
            {/* Grab handle badge — hidden while locked since drag is disabled. */}
            {!locked && (
                <div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-white border border-[#e8ded5] group-hover:border-[#cfb79f] rounded-md h-6 w-9 flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.06)] cursor-grab active:cursor-grabbing z-20 group-hover:scale-110 transition-all duration-200"
                    title="Drag to reorder"
                >
                    <GripHorizontal className="h-3.5 w-3.5 text-[#8a7667] group-hover:text-[#cfb79f] transition-colors duration-200" />
                </div>
            )}

            {/* Delete button — hidden while locked so references can't be
                pulled out from under an in-flight AI generation. */}
            {!locked && (
                <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove(index);
                    }}
                    aria-label="Remove image"
                    className="absolute right-2.5 top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white shadow-sm hover:scale-105 active:scale-95 transition-transform z-30 cursor-pointer"
                >
                    <X className="h-3 w-3" />
                </button>
            )}

            <div className="relative w-full h-full rounded-[18px] overflow-hidden pointer-events-none select-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={url}
                    alt={`Preview ${index + 1}`}
                    className="h-full w-full object-cover pointer-events-none select-none"
                    style={{ WebkitTouchCallout: "none" }}
                    draggable={false}
                />
                {isCoverCard ? (
                    <span className="absolute left-2.5 bottom-2.5 bg-[#cfb79f] text-[#4a3328] text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                        {roleLabel}
                    </span>
                ) : (
                    <span className="absolute left-2.5 bottom-2.5 bg-black/60 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                        {roleLabel}
                    </span>
                )}
            </div>
        </div>
    );
}
