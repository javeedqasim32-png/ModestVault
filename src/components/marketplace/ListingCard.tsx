import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import FavoriteButton from "./FavoriteButton";

type ListingCardProps = {
    href: string;
    imageUrl: string;
    title: string;
    titleClassName?: string;
    description?: string | null;
    price: number | string;
    category?: string | null;
    condition?: string | null;
    status?: string | null;
    sellerName?: React.ReactNode;
    dateText?: string | null;
    featured?: boolean;
    compact?: boolean;
    showFullImage?: boolean;
    listingId?: string;
    isFavorited?: boolean;
};

export default function ListingCard({
    href,
    imageUrl,
    title,
    titleClassName,
    description,
    price,
    category,
    condition,
    status,
    sellerName,
    dateText,
    featured = false,
    compact = false,
    showFullImage = false,
    listingId,
    isFavorited = false,
}: ListingCardProps) {
    const imageFitClass = showFullImage ? "object-contain object-center" : "object-cover object-center";
    const imageAspectClass = compact ? "aspect-square" : (showFullImage ? "aspect-[3/4]" : "aspect-square");
    const imageBgClass = showFullImage ? "bg-transparent" : "bg-muted";

    return (
        <Link
            href={href}
            className={`group overflow-hidden rounded-[1.6rem] border border-border/80 bg-[linear-gradient(180deg,#faf5f2_0%,#f4eae3_100%)] shadow-[0_14px_36px_rgba(110,82,63,0.07)] ${featured ? "md:col-span-2" : ""}`}
        >
            <div className={`grid h-full ${featured ? "md:grid-cols-[0.95fr_1.05fr]" : ""}`}>
                <div className={`relative overflow-hidden ${imageBgClass} ${imageAspectClass}`}>
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        className={`${imageFitClass} transition-transform duration-700 group-hover:scale-105`}
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    />
                </div>

                <div className="flex flex-col justify-between p-4 sm:p-5">
                    <div>
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                                {category ? (
                                    <Badge variant="outline" className="rounded-full bg-card text-[9px]">
                                        {category}
                                    </Badge>
                                ) : null}
                                {condition ? (
                                    <Badge variant="secondary" className="rounded-full text-[9px]">
                                        {condition}
                                    </Badge>
                                ) : null}
                                {status ? (
                                    <Badge variant={status === "AVAILABLE" ? "default" : "secondary"} className="rounded-full text-[9px]">
                                        {status}
                                    </Badge>
                                ) : null}
                            </div>
                            {compact ? (
                                <MoreHorizontal className="h-5 w-5 text-foreground/60" />
                            ) : listingId ? (
                                <FavoriteButton listingId={listingId} initialFavorited={isFavorited} />
                            ) : (
                                <Heart className="h-5 w-5 text-foreground/70" />
                            )}
                        </div>

                        <h3 className={`font-serif text-2xl leading-tight text-foreground sm:text-[1.9rem] ${titleClassName ?? ""}`}>
                            {title}
                        </h3>
                        {description ? (
                            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                                {description}
                            </p>
                        ) : null}
                    </div>

                    <div className="mt-6 flex items-end justify-between gap-4">
                        <div>
                            {sellerName ? <p className="text-sm text-muted-foreground">{sellerName}</p> : null}
                            {dateText ? <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{dateText}</p> : null}
                            <p className="mt-1 text-xl text-foreground sm:text-2xl">${Number(price).toLocaleString()}</p>
                        </div>
                        <span className="rounded-full border border-border bg-card px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-foreground sm:px-4 sm:text-[11px]">
                            View
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
