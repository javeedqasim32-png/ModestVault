"use client";

import { useEffect } from "react";
import { trackMetaEvent } from "@/lib/meta-pixel";

/**
 * Fires fbq('track', 'ViewContent', {...}) once when a listing detail
 * page renders. Meta uses ViewContent to build retargeting audiences
 * ("browsed but didn't buy") and to score ad-click quality.
 */
export function ViewContentPixel({
    listingId,
    title,
    price,
    category,
}: {
    listingId: string;
    title: string;
    price: number;
    category?: string | null;
}) {
    useEffect(() => {
        trackMetaEvent("ViewContent", {
            content_ids: [listingId],
            content_name: title,
            content_type: "product",
            content_category: category ?? undefined,
            value: price,
            currency: "USD",
        });
    }, [listingId, title, price, category]);

    return null;
}
