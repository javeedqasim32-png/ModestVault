import { stripe } from "@/lib/stripe";
import { finalizeCheckout } from "@/lib/checkout-finalize";

// `dynamic` ensures this route runs server-side on every request — webhooks
// must NOT be cached or statically optimized.
export const dynamic = "force-dynamic";

/**
 * Stripe webhook handler. Verifies the `Stripe-Signature` HMAC against our
 * webhook signing secret, then dispatches on `event.type`.
 *
 * For `checkout.session.completed` we call `finalizeCheckout(session.id)` —
 * the same helper the buyer-facing `/buy/success` page uses. This makes order
 * creation durable even when the buyer never returns to the success page
 * (closed tab, lost network, mobile Safari dropping the redirect, etc.).
 *
 * The helper is idempotent on `Purchase.stripe_session_id` so both call sites
 * can safely run for the same session without duplicating orders or labels.
 */
export async function POST(req: Request) {
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !secret) {
        console.warn("[stripe webhook] missing signature header or STRIPE_WEBHOOK_SECRET env");
        return new Response("Bad request", { status: 400 });
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (err) {
        const message = err instanceof Error ? err.message : "unknown signature error";
        console.warn("[stripe webhook] signature verification failed:", message);
        return new Response("Invalid signature", { status: 401 });
    }

    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as { id: string };
            const result = await finalizeCheckout(session.id);
            console.log(`[stripe webhook] checkout.session.completed → ${result.status}`, {
                sessionId: session.id,
                eventId: event.id,
            });
        }
        // Other event types are accepted (200) so Stripe doesn't retry,
        // but we don't act on them. Add handlers here as we expand coverage
        // (charge.refunded, charge.dispute.created, etc.).
    } catch (err) {
        const message = err instanceof Error ? err.message : "unknown handler error";
        console.error(`[stripe webhook] handler error for event ${event.id} (${event.type}):`, message);
        // Return 500 → Stripe will retry with exponential backoff. Safe
        // because `finalizeCheckout` is idempotent on stripe_session_id.
        return new Response("Handler error", { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}
