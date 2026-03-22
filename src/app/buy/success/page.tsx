import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { BuySuccessClient } from "@/components/marketplace/BuySuccessClient";
import { purchaseLabel } from "@/lib/shippo";

export const dynamic = "force-dynamic";

export default async function BuySuccessPage({ searchParams }: { searchParams: Promise<{ session_id: string; listingId: string; edit?: string }> }) {
    const { session_id, listingId, edit } = await searchParams;
    const session = await auth();
    const forceAddressEdit = edit === "1";

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (!session_id || !listingId) {
        redirect("/browse");
    }

    // 1. Verify the checkout session with Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
    const metadata = (checkoutSession.metadata || {}) as Record<string, string>;
    const shippingAddressFromMeta = metadata.shipLine1 ? {
        name: metadata.shipName || "",
        line1: metadata.shipLine1 || "",
        line2: metadata.shipLine2 || "",
        city: metadata.shipCity || "",
        state: metadata.shipState || "",
        postal_code: metadata.shipPostal || "",
        country: metadata.shipCountry || "US",
        phone: metadata.shipPhone || "",
    } : null;
    const shippingOptionSelectedInCheckout = !!metadata.shippingRateId;

    if (checkoutSession.payment_status === "paid") {
        let order = await (prisma as any).order.findFirst({
            where: { purchase: { stripe_session_id: session_id } },
            include: { purchase: { include: { listing: { include: { user: true } } } } }
        });

        if (!order) {
            try {
                const listing = await prisma.listing.findUnique({
                    where: { id: listingId },
                    include: { user: true }
                });

                if (!listing) throw new Error("LISTING_NOT_FOUND");

                await prisma.$transaction(async (tx) => {
                    const currentListing = await tx.listing.findUnique({ where: { id: listingId } });
                    if (!currentListing || currentListing.status !== "AVAILABLE") {
                        throw new Error("ALREADY_SOLD");
                    }

                    await tx.listing.update({
                        where: { id: listingId },
                        data: { status: "SOLD" }
                    });

                    const newPurchase = await tx.purchase.create({
                        data: {
                            buyer_id: session.user?.id || "",
                            listing_id: listingId,
                            amount: metadata.itemAmountCents
                                ? Number(metadata.itemAmountCents) / 100
                                : (checkoutSession.amount_total || 0) / 100,
                            stripe_session_id: session_id,
                        }
                    });

                    order = await (tx as any).order.create({
                        data: {
                            purchase_id: newPurchase.id,
                            order_status: "PAID",
                            shipping_status: "NOT_SHIPPED",
                            shipping_stage: shippingOptionSelectedInCheckout
                                ? "OPTION_SELECTED"
                                : (shippingAddressFromMeta ? "ADDRESS_SET" : "ADDRESS_MISSING"),
                            shipping_address: shippingAddressFromMeta || undefined,
                            shipping_option_rate_id: metadata.shippingRateId || undefined,
                            shipping_option_carrier: metadata.shippingCarrier || undefined,
                            shipping_option_service: metadata.shippingService || undefined,
                            shipping_option_amount: metadata.shippingAmountCents
                                ? (Number(metadata.shippingAmountCents) / 100).toFixed(2)
                                : undefined,
                            shipping_option_currency: metadata.shippingCurrency || undefined,
                            shipping_option_selected_at: shippingOptionSelectedInCheckout ? new Date() : undefined,
                        },
                        include: { purchase: { include: { listing: { include: { user: true } } } } }
                    });

                    // Remove purchased item from buyer cart.
                    await tx.cartItem.deleteMany({
                        where: {
                            user_id: session.user?.id || "",
                            listing_id: listingId,
                        }
                    });
                });
            } catch (error: any) {
                if (error.message === "ALREADY_SOLD") {
                    return (
                        /* ... same Already Sold UI ... */
                        <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                            <div className="max-w-xl w-full text-center space-y-10 group">
                                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
                                <h1 className="text-4xl font-black">Item No Longer Available</h1>
                                <p>This item was sold to another buyer while you were checking out. A refund has been initiated.</p>
                                <Link href="/browse"><Button>Back to Marketplace</Button></Link>
                            </div>
                        </div>
                    );
                }
                throw error;
            }
        }

        // Idempotent cleanup for repeat visits to success page.
        await prisma.cartItem.deleteMany({
            where: {
                user_id: session.user.id,
                listing_id: listingId,
            }
        });

        let autoLabelError: string | null = null;
        if (order && order.shipping_stage === "OPTION_SELECTED" && !order.label_url && order.shipping_option_rate_id) {
            try {
                const labelData = await purchaseLabel(order.shipping_option_rate_id);
                order = await (prisma as any).order.update({
                    where: { id: order.id },
                    data: {
                        shipping_stage: "LABEL_PURCHASED",
                        shipping_status: "PROCESSING",
                        tracking_number: labelData.tracking_number,
                        carrier: order.shipping_option_carrier || "Carrier",
                        shippo_transaction_id: labelData.shippo_transaction_id,
                        label_url: labelData.label_url
                    },
                    include: { purchase: { include: { listing: { include: { user: true } } } } }
                });
            } catch (error: any) {
                const errorMessage = error?.message || "Failed to generate label.";
                autoLabelError = errorMessage;

                // If Shippo rejected recipient details, force buyer back into address/rate flow.
                const normalizedError = errorMessage.toLowerCase();
                if (
                    normalizedError.includes("recipient address invalid") ||
                    normalizedError.includes("address not found") ||
                    normalizedError.includes("address_from.phone") ||
                    normalizedError.includes("phone field should contain")
                ) {
                    order = await (prisma as any).order.update({
                        where: { id: order.id },
                        data: {
                            shipping_stage: "ADDRESS_SET",
                            shipping_status: "NOT_SHIPPED",
                            shipping_option_rate_id: null,
                            shipping_option_carrier: null,
                            shipping_option_service: null,
                            shipping_option_amount: null,
                            shipping_option_currency: null,
                            shipping_option_selected_at: null
                        },
                        include: { purchase: { include: { listing: { include: { user: true } } } } }
                    });
                }
            }
        }

        // If order already has a label, skip to success
        if (order && order.shipping_status !== "NOT_SHIPPED" && order.label_url) {
            return (
                <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
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

        if (order && order.shipping_stage === "OPTION_SELECTED") {
            return (
                <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                    <div className="max-w-2xl w-full text-center space-y-8">
                        <h1 className="text-5xl font-black tracking-tighter text-foreground">
                            Order Confirmed
                        </h1>
                        <p className="text-lg text-muted-foreground">
                            Payment and shipping choice are confirmed. Your label is being prepared.
                        </p>
                        {autoLabelError ? (
                            <p className="text-sm text-amber-700">
                                We could not finalize your label yet: {autoLabelError}
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

        // Prepare initial address from Stripe if available
        const stripeShipping = (checkoutSession as any).shipping_details;
        const orderAddress = (order?.shipping_address || null) as any;
        const initialAddress = orderAddress ? {
            name: orderAddress.name || stripeShipping?.name || "",
            line1: orderAddress.line1 || orderAddress.street1 || stripeShipping?.address?.line1 || "",
            line2: orderAddress.line2 || orderAddress.street2 || stripeShipping?.address?.line2 || "",
            city: orderAddress.city || stripeShipping?.address?.city || "",
            state: orderAddress.state || stripeShipping?.address?.state || "",
            postal_code: orderAddress.postal_code || orderAddress.zip || stripeShipping?.address?.postal_code || "",
            country: orderAddress.country || stripeShipping?.address?.country || "US",
            phone: orderAddress.phone || checkoutSession.customer_details?.phone || ""
        } : (stripeShipping?.address ? {
            name: stripeShipping.name || "",
            line1: stripeShipping.address.line1 || "",
            line2: stripeShipping.address.line2 || "",
            city: stripeShipping.address.city || "",
            state: stripeShipping.address.state || "",
            postal_code: stripeShipping.address.postal_code || "",
            country: stripeShipping.address.country || "US",
            phone: checkoutSession.customer_details?.phone || ""
        } : undefined);

        return (
            <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                <BuySuccessClient
                    orderId={order!.id}
                    initialAddress={initialAddress}
                    forceAddressStep={forceAddressEdit}
                />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
            <div className="max-w-xl w-full text-center space-y-6">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
                <h1 className="text-3xl font-black">Payment Incomplete</h1>
                <p className="text-muted-foreground">We could not confirm your payment. Please try checkout again.</p>
                <Link href="/browse">
                    <Button>Back to Marketplace</Button>
                </Link>
            </div>
        </div>
    );
}
