"use client";

import Image from "next/image";
import { useMemo, useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ListingGalleryImage = {
    originalUrl: string;
    mediumUrl: string;
    thumbUrl: string;
};

type ListingImageGalleryProps = {
    images: ListingGalleryImage[];
    title: string;
    isSold: boolean;
};

export default function ListingImageGallery({ images, title, isSold }: ListingImageGalleryProps) {
    const safeImages = useMemo(
        () => images.filter((image) => image.originalUrl || image.mediumUrl || image.thumbUrl),
        [images]
    );
    
    const [activeIndex, setActiveIndex] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isScrollingRef = useRef(false);

    if (safeImages.length === 0) {
        return null;
    }

    // Handle scroll to update active index
    const handleScroll = () => {
        if (!scrollContainerRef.current || isScrollingRef.current) return;

        const container = scrollContainerRef.current;
        const width = container.offsetWidth;
        const scrollLeft = container.scrollLeft;
        const index = Math.round(scrollLeft / width);
        
        if (index !== activeIndex && index >= 0 && index < safeImages.length) {
            setActiveIndex(index);
        }
    };

    // Handle thumbnail/arrow click
    const scrollToImage = (index: number) => {
        if (!scrollContainerRef.current) return;
        
        isScrollingRef.current = true;
        setActiveIndex(index);
        
        const container = scrollContainerRef.current;
        container.scrollTo({
            left: index * container.offsetWidth,
            behavior: "smooth"
        });

        // Release scroll lock after animation
        setTimeout(() => {
            isScrollingRef.current = false;
        }, 500);
    };

    return (
        <div className="space-y-4">
            <div className="relative group px-4">
                {/* Main Scroll Container */}
                <div 
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex aspect-[3/4] w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory rounded-[18px] border border-[#ddd3cb] bg-[#faf8f6] no-scrollbar select-none"
                    style={{ 
                        scrollbarWidth: 'none', 
                        msOverflowStyle: 'none',
                        touchAction: 'manipulation'
                    }}
                >
                    {safeImages.map((image, index) => (
                        <div 
                            key={`main-${index}`}
                            className="relative h-full w-full flex-shrink-0 snap-center"
                        >
                            <Image
                                src={image.mediumUrl || image.originalUrl || image.thumbUrl}
                                alt={`${title} - image ${index + 1}`}
                                fill
                                className="object-cover pointer-events-none"
                                priority={index === 0}
                                sizes="(max-width: 760px) 100vw, 760px"
                                draggable={false}
                            />
                        </div>
                    ))}
                </div>

                {/* Sold Overlay */}
                {isSold && (
                    <div className="pointer-events-none absolute inset-x-4 inset-y-0 z-10 flex items-center justify-center bg-black/25 rounded-[18px]">
                        <span className="text-2xl font-semibold uppercase tracking-widest text-white shadow-sm">
                            Sold Out
                        </span>
                    </div>
                )}

                {/* Navigation Arrows (Desktop) */}
                {safeImages.length > 1 && (
                    <>
                        <button
                            type="button"
                            onClick={() => scrollToImage(Math.max(0, activeIndex - 1))}
                            disabled={activeIndex === 0}
                            className="absolute left-6 top-1/2 -translate-y-1/2 z-20 h-10 w-10 flex items-center justify-center rounded-full bg-white/80 border border-[#ddd3cb] text-[#2f2925] opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden shadow-sm"
                        >
                            <ChevronLeft className="h-6 w-6" />
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollToImage(Math.min(safeImages.length - 1, activeIndex + 1))}
                            disabled={activeIndex === safeImages.length - 1}
                            className="absolute right-6 top-1/2 -translate-y-1/2 z-20 h-10 w-10 flex items-center justify-center rounded-full bg-white/80 border border-[#ddd3cb] text-[#2f2925] opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden shadow-sm"
                        >
                            <ChevronRight className="h-6 w-6" />
                        </button>
                    </>
                )}

                {/* Pagination Dots */}
                {safeImages.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 px-2 py-1 rounded-full bg-black/20 backdrop-blur-sm">
                        {safeImages.map((_, index) => (
                            <div 
                                key={`dot-${index}`}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                    index === activeIndex ? "w-4 bg-white" : "w-1.5 bg-white/60"
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Thumbnail Selection */}
            {safeImages.length > 1 && (
                <div className="flex gap-3 overflow-x-auto px-4 py-2 no-scrollbar">
                    {safeImages.map((image, index) => {
                        const thumbSrc = image.thumbUrl || image.mediumUrl || image.originalUrl;
                        const isActive = index === activeIndex;
                        return (
                            <button
                                key={`thumb-${index}`}
                                type="button"
                                onClick={() => scrollToImage(index)}
                                className={`relative aspect-[3/4] h-24 w-18 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-200 ${
                                    isActive 
                                        ? "border-[#a07c61] ring-2 ring-[#a07c61]/20 scale-105" 
                                        : "border-border/40 opacity-50 grayscale-[40%] hover:opacity-100 hover:grayscale-0"
                                }`}
                            >
                                <Image
                                    src={thumbSrc}
                                    alt={`Thumbnail ${index + 1}`}
                                    fill
                                    className="object-cover"
                                    sizes="120px"
                                />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
