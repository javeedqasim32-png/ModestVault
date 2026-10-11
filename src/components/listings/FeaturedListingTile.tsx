import Image from "next/image";
import Link from "next/link";
import FavoriteButton from "@/components/marketplace/FavoriteButton";
import type { EffectivePrice } from "@/lib/promotions/get-effective-price";

/**
 * The home-page "Featured" tile, extracted so other surfaces (listing-page
 * "Similar items") render byte-for-byte the same card: 3:4 portrait image,
 * 28px heart, promo badge top-left, category eyebrow, 2-line title, price +
 * size code. Keep this in sync with the inline tiles in src/app/page.tsx,
 * src/app/browse/page.tsx and src/app/[id]/page.tsx until those adopt it.
 */
export type FeaturedListingTileProps = {
    id: string;
    title: string;
    category: string | null;
    size?: string | null;
    price: number;
    coverImage: string;
    isFavorited: boolean;
    effectivePrice?: EffectivePrice | null;
};

export function toSizeCode(size?: string | null) {
    const normalized = size?.trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "small") return "S";
    if (normalized === "medium") return "M";
    if (normalized === "large") return "L";
    if (normalized === "xlarge" || normalized === "x-large" || normalized === "extra large") return "XL";
    if (normalized === "xxlarge" || normalized === "xx-large" || normalized === "extra extra large") return "XXL";
    return normalized.toUpperCase();
}

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function FeaturedListingTile({
    id,
    title,
    category,
    size,
    price,
    coverImage,
    isFavorited,
    effectivePrice,
}: FeaturedListingTileProps) {
    const hasPromo = !!effectivePrice && effectivePrice.discountPercent > 0;
    return (
        <Link
            href={`/listings/${id}`}
            className="group relative flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-[#ece3dc] bg-white transition-transform duration-150 hover:-translate-y-0.5"
        >
            <div className="relative aspect-[3/4] w-full min-w-0 overflow-hidden bg-[#faf8f6]">
                {coverImage ? (
                    <Image
                        src={coverImage}
                        alt={title}
                        fill
                        className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                ) : null}
                <div className="absolute right-[6px] top-[6px] z-10 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-white/90">
                    <div className="scale-[0.65]">
                        <FavoriteButton listingId={id} initialFavorited={isFavorited} />
                    </div>
                </div>
                {hasPromo ? (
                    <span className="absolute left-[6px] top-[6px] z-10 rounded-full bg-[#4a3328] px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.13em] text-white shadow-sm">
                        {effectivePrice!.discountPercent}% Off
                    </span>
                ) : null}
            </div>

            <div className="flex min-w-0 flex-1 flex-col px-[10px] pb-[10px] pt-[8px]">
                <div className="mb-[2px] truncate text-[9px] uppercase tracking-[0.1em] text-[#8a7667]">{category}</div>
                <h3 className="mb-[2px] line-clamp-2 text-[12px] font-normal leading-[1.3] text-[#2f2925]" title={title}>
                    {title}
                </h3>
                <div className="mt-auto flex items-end justify-between gap-2">
                    {hasPromo ? (
                        <p className="flex min-w-0 flex-1 items-baseline gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-[#2f2925]">{money(effectivePrice!.effectiveCents)}</span>
                            <span className="text-[11px] text-[#8a7667] line-through">{money(effectivePrice!.originalCents)}</span>
                        </p>
                    ) : (
                        <p className="truncate text-[13px] font-semibold text-[#2f2925]">${Number(price).toLocaleString()}</p>
                    )}
                    {size ? (
                        <span className="shrink-0 text-[12px] font-normal uppercase tracking-[0.04em] text-[#8a7667]">{toSizeCode(size)}</span>
                    ) : null}
                </div>
            </div>
        </Link>
    );
}
