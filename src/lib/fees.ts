// Buyer-facing processing & handling fee. Passed on top of item + shipping
// so Modaire recovers most of Stripe's 2.9% + $0.30 per-transaction cost.
//
// Flat 3% (no fixed component) is chosen for buyer-facing simplicity over
// exact pass-through. Trade-off vs Stripe's actual cost:
//   - orders under ~$300: Modaire still absorbs a small residual (≤$0.30)
//   - orders ~$300: breakeven
//   - orders over ~$300: Modaire slightly overcollects (offsets refund fees)
// On a typical $75 order, fee absorption drops from ~$2.77 → ~$0.22
// (~92% reduction) vs the pre-fee state where Modaire ate the whole thing.

export const PROCESSING_FEE_PERCENT = 0.03;

/**
 * Buyer-facing processing & handling fee on a `subtotalCents` of item +
 * shipping. Ceilinged so we never fractionally undercollect. Returns cents.
 */
export function computeProcessingFeeCents(subtotalCents: number): number {
    if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
    return Math.ceil(subtotalCents * PROCESSING_FEE_PERCENT);
}
