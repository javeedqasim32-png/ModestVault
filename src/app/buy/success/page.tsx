import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { BuySuccessClient } from "@/components/marketplace/BuySuccessClient";
import { PurchasePixel } from "@/components/analytics/PurchasePixel";
import { finalizeCheckout } from "@/lib/checkout-finalize";

export const dynamic = "force-dynamic";

export default async function BuySuccessPage({ searchParams }: { searchParams: Promise<{ session_id: string; listingId?: string; bundleId?: string; edit?: string }> }) {
    const { session_id, listingId, bundleId, edit } = await searchParams;
    const session = await auth();
    const forceAddressEdit = edit === "1";

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (!session_id || (!listingId && !bundleId)) {
        redirect("/browse");
    }

    // All business logic — Stripe session retrieval, payment check, Purchase
    // and Order creation (transactional), Shippo label purchase, emails,
    // notifications — lives in `finalizeCheckout`. The same function is also
    // invoked by the Stripe webhook so order creation is durable even if the
    // buyer never reaches this page.
    const result = await finalizeCheckout(session_id);

    if (result.status === "NOT_PAID") {
        return (
            <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                <div className="max-w-xl w-full text-center space-y-6">
                    <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
                    <h1 className="text-3xl font-black">Payment Processing</h1>
                    <p className="text-muted-foreground">
                        We&apos;re still confirming your payment with Stripe. You&apos;ll receive an email as soon as it clears. Feel free to close this page.
                    </p>
                    <Link href="/browse">
                        <Button>Keep Exploring</Button>
                    </Link>
                </div>
            </div>
        );
    }

    if (result.status === "MISSING_LISTING") {
        redirect("/browse");
    }

    if (result.status === "ALREADY_SOLD") {
        const headline = result.isBundle ? "Items No Longer Available" : "Item No Longer Available";
        const body = result.isBundle
            ? "One or more items in your bundle were sold to another buyer while you were checking out. A refund has been initiated."
            : "This item was sold to another buyer while you were checking out. A refund has been initiated.";
        return (
            <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                <div className="max-w-xl w-full text-center space-y-10 group">
                    <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
                    <h1 className="text-4xl font-black">{headline}</h1>
                    <p>{body}</p>
                    <Link href="/browse"><Button>Back to Marketplace</Button></Link>
                </div>
            </div>
        );
    }

    // ────────────────────────────────────────────────────────────────────
    // FINALIZED or ALREADY_FINALIZED — render confirmation
    // ────────────────────────────────────────────────────────────────────

    // Pull the Stripe session ONCE so every success render branch can pass
    // the correct amount + content_ids to the Meta Pixel Purchase event.
    // Downstream branches that also need `checkoutSession` (address-edit
    // flow) reuse this instance instead of re-fetching.
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
    const purchaseValue = ((checkoutSession.amount_total ?? 0) / 100);
    const purchaseCurrency = (checkoutSession.currency ?? "usd").toUpperCase();
    const purchaseContentIds: string[] = result.isBundle
        ? (result.bundleOrders?.map((o) => o.listing_id).filter((id): id is string => !!id) ?? [])
        : (listingId ? [listingId] : []);

    if (result.isBundle) {
        const bundleListingsCount = result.bundleOrders?.length ?? 0;
        return (
            <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                <PurchasePixel eventId={session_id} value={purchaseValue} currency={purchaseCurrency} contentIds={purchaseContentIds} />
                <div className="max-w-2xl w-full text-center space-y-8">
                    <h1 className="text-5xl font-black tracking-tighter text-foreground">
                        Order Confirmed
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        Your payment was successful — {bundleListingsCount} items shipping together in one package.
                    </p>
                    {result.bundleAutoLabelError ? (
                        <p className="text-sm text-amber-700">
                            We could not finalize your label yet: {result.bundleAutoLabelError}
                        </p>
                    ) : null}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
                        <Link href="/">
                            <Button variant="secondary" className="w-full">Back to Home</Button>
                        </Link>
                        <Link href="/dashboard/purchases">
                            <Button className="w-full">Order History</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Single-item path below — render order confirmation, optionally the
    // address-edit flow if Shippo couldn't generate a label.
    const order = result.order;
    if (!order || !listingId) {
        redirect("/browse");
    }

    // If order already has a label, render the "all set" confirmation.
    if (order.shipping_status !== "NOT_SHIPPED" && order.label_url) {
        return (
            <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                <PurchasePixel eventId={session_id} value={purchaseValue} currency={purchaseCurrency} contentIds={purchaseContentIds} />
                <div className="max-w-2xl w-full text-center space-y-8">
                    <h1 className="text-5xl font-black tracking-tighter text-foreground">
                        Order Confirmed
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        Your payment was successful and your shipping label is ready.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto">
                        <Link href="/">
                            <Button variant="secondary" className="w-full">Back to Home</Button>
                        </Link>
                        <Link href={`/buy/success?session_id=${session_id}&listingId=${listingId}&edit=1`}>
                            <Button variant="outline" className="w-full">Edit Shipping Details</Button>
                        </Link>
                        <Link href="/dashboard/purchases">
                            <Button className="w-full">Order History</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (order.shipping_stage === "OPTION_SELECTED") {
        return (
            <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                <PurchasePixel eventId={session_id} value={purchaseValue} currency={purchaseCurrency} contentIds={purchaseContentIds} />
                <div className="max-w-2xl w-full text-center space-y-8">
                    <h1 className="text-5xl font-black tracking-tighter text-foreground">
                        Order Confirmed
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        Payment and shipping choice are confirmed. Your label is being prepared.
                    </p>
                    {result.autoLabelError ? (
                        <p className="text-sm text-amber-700">
                            We could not finalize your label yet: {result.autoLabelError}
                        </p>
                    ) : null}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto">
                        <Link href="/">
                            <Button variant="secondary" className="w-full">Back to Home</Button>
                        </Link>
                        <Link href="/dashboard/purchases">
                            <Button className="w-full">Order History</Button>
                        </Link>
                        <Link href="/browse">
                            <Button variant="secondary" className="w-full">Keep Exploring</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Buyer needs to provide address / select shipping — derive the best-known
    // initial address from the saved Order or Stripe's recorded customer_details.
    // (checkoutSession was already retrieved above for pixel Purchase params.)
    const stripeShipping = (checkoutSession as any).shipping_details;
    const orderAddress = (order.shipping_address || null) as any;
    const initialAddress = orderAddress ? {
        name: orderAddress.name || stripeShipping?.name || "",
        line1: orderAddress.line1 || orderAddress.street1 || stripeShipping?.address?.line1 || "",
        line2: orderAddress.line2 || orderAddress.street2 || stripeShipping?.address?.line2 || "",
        city: orderAddress.city || stripeShipping?.address?.city || "",
        state: orderAddress.state || stripeShipping?.address?.state || "",
        postal_code: orderAddress.postal_code || orderAddress.zip || stripeShipping?.address?.postal_code || "",
        country: orderAddress.country || stripeShipping?.address?.country || "US",
        phone: orderAddress.phone || checkoutSession.customer_details?.phone || "",
    } : (stripeShipping?.address ? {
        name: stripeShipping.name || "",
        line1: stripeShipping.address.line1 || "",
        line2: stripeShipping.address.line2 || "",
        city: stripeShipping.address.city || "",
        state: stripeShipping.address.state || "",
        postal_code: stripeShipping.address.postal_code || "",
        country: stripeShipping.address.country || "US",
        phone: checkoutSession.customer_details?.phone || "",
    } : undefined);

    return (
        <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
            <PurchasePixel eventId={session_id} value={purchaseValue} currency={purchaseCurrency} contentIds={purchaseContentIds} />
            <BuySuccessClient
                orderId={order.id}
                initialAddress={initialAddress}
                forceAddressStep={forceAddressEdit}
            />
        </div>
    );
}
