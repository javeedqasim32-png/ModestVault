import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is missing from environment variables');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-01-27.acacia' as any,
    typescript: true,
});

export type RefundReason = "duplicate" | "fraudulent" | "requested_by_customer";

/**
 * Refund the buyer's payment for a PaymentIntent. Always full refund — partial
 * is out of scope for now. Returns the Stripe refund object or throws.
 */
export async function refundPayment(paymentIntentId: string, opts: {
    reason?: RefundReason;
    metadata?: Record<string, string>;
}) {
    return stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: opts.reason,
        metadata: opts.metadata,
    });
}

/**
 * Reverse a previously-released seller transfer. Pulls funds back from the
 * seller's connected account into the platform balance. Fails if the seller
 * has already withdrawn the funds and their balance is insufficient — caller
 * should surface that as a hard failure for manual collection.
 */
export async function reverseTransfer(transferId: string, opts?: {
    amount?: number;
    metadata?: Record<string, string>;
}) {
    return stripe.transfers.createReversal(transferId, {
        amount: opts?.amount,
        metadata: opts?.metadata,
    });
}
