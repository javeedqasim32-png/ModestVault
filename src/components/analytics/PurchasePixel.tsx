"use client";

import { useEffect, useRef } from "react";
import { trackMetaEvent } from "@/lib/meta-pixel";

/**
 * Fires fbq('track', 'Purchase', {...}) exactly once when the buy-success
 * page renders. Uses a ref to guard against React 18 strict-mode double-
 * mount in dev. Same-tab refreshes will re-fire the event, but the caller
 * can pass an `eventId` (Stripe session id or order id) so Meta's server
 * dedupes at the pixel-events level.
 *
 * `value` should be the total amount charged in dollars (not cents). The
 * caller derives it from the Stripe checkout session's amount_total.
 */
export function PurchasePixel({
    eventId,
    value,
    currency = "USD",
    contentIds,
}: {
    eventId?: string;
    value: number;
    currency?: string;
    contentIds: string[];
}) {
    const firedRef = useRef(false);

    useEffect(() => {
        if (firedRef.current) return;
        firedRef.current = true;
        trackMetaEvent("Purchase", {
            value,
            currency,
            content_ids: contentIds,
            content_type: "product",
            num_items: contentIds.length,
            ...(eventId ? { eventID: eventId } : {}),
        });
    }, [eventId, value, currency, contentIds]);

    return null;
}
