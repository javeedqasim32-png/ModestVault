import { serializePurchase } from "@/lib/serialization";
import { auth } from "@/auth";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import ListingCard from "@/components/marketplace/ListingCard";
import MobileOrdersClient from "./MobileOrdersClient";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    const purchases = ((await (prisma.purchase as any).findMany({
        where: { buyer_id: session.user.id },
        include: {
            order: true,
            listing: {
                include: {
                    images: {
                        orderBy: { imageOrder: "asc" },
                        take: 1,
                        select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
                    },
                    user: {
                        select: {
                            first_name: true,
                            last_name: true
                        }
                    }
                }
            }
        },
        orderBy: { created_at: "desc" }
    })) as any[]).map(p => serializePurchase(p));

    const mobileOrders = purchases.map((purchase) => {
        const orderStatus = purchase.order?.shipping_status || "PROCESSING";

        let tab: "Active Orders" | "Completed" | "Disputes / Refunds" = "Active Orders";
        if (orderStatus === "DELIVERED") tab = "Completed";
        if (orderStatus === "CANCELLED" || orderStatus === "RETURNED") tab = "Disputes / Refunds";

        return {
            id: purchase.id,
            listing_id: purchase.listing_id,
            stripe_session_id: purchase.stripe_session_id,
            amount: purchase.amount, // purchase.amount is already a number from serialization
            status: orderStatus.replace("_", " "),
            created_at: purchase.created_at, // Already stringified
            tab,
            tracking_number: purchase.order?.tracking_number,
            carrier: purchase.order?.carrier,
            shipping_stage: purchase.order?.shipping_stage || "ADDRESS_MISSING",
            has_shipping_address: !!purchase.order?.shipping_address,
            listing: {
                image_url: getPrimaryListingImage(purchase.listing, "card"),
                title: purchase.listing.title,
                description: purchase.listing.description,
                user: {
                    first_name: purchase.listing.user.first_name,
                    last_name: purchase.listing.user.last_name,
                },
            },
        };
    });

    return (
        <>
            <MobileOrdersClient orders={mobileOrders} />

            <div className="hidden space-y-6 sm:block">
                <div className="rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,#faf5f1_0%,#f1e7e0_100%)] p-6 sm:p-8">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Orders</p>
                    <h1 className="mt-2 font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                        My Purchases
                    </h1>
                    <p className="text-muted-foreground">Track and manage your order history.</p>
                </div>

                {purchases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-border py-24 text-center px-6">
                        <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mb-6" />
                        <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">No purchases yet</h2>
                        <p className="text-muted-foreground max-w-sm mx-auto mb-8">
                            Start exploring the marketplace to find unique pieces.
                        </p>
                        <Link href="/browse">
                            <Button>Explore Marketplace</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {purchases.map((purchase) => {
                            const trackingUrl = purchase.order?.tracking_number
                                ? (purchase.order.carrier === "USPS"
                                    ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${purchase.order.tracking_number}`
                                    : `https://google.com/search?q=${purchase.order.carrier}+tracking+${purchase.order.tracking_number}`)
                                : null;
                            const stage = purchase.order?.shipping_stage || "ADDRESS_MISSING";
                            const canResumeBuyerShippingFlow =
                                (stage === "ADDRESS_MISSING" || stage === "ADDRESS_SET" || stage === "OPTION_SELECTED") &&
                                !purchase.order?.tracking_number &&
                                !!purchase.stripe_session_id;
                            const completeShippingHref = `/buy/success?session_id=${purchase.stripe_session_id}&listingId=${purchase.listing_id}`;

                            return (
                                <div key={purchase.id} className="space-y-2">
                                    <ListingCard
                                        href={`/listings/${purchase.listing_id}`}
                                        imageUrl={getPrimaryListingImage(purchase.listing, "card")}
                                        title={purchase.listing.title}
                                        description={purchase.listing.description}
                                        price={Number(purchase.amount)}
                                        category={purchase.listing.category}
                                        status={purchase.order?.shipping_status.replace("_", " ") || "PROCESSING"}
                                        sellerName={`Sold by ${purchase.listing.user.first_name} ${purchase.listing.user.last_name}`}
                                        dateText={new Date(purchase.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                        compact
                                    />

                                    {trackingUrl ? (
                                        <a
                                            href={trackingUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 pl-1 text-sm text-primary hover:underline font-semibold"
                                        >
                                            <span>Tracking:</span>
                                            <span>{purchase.order?.tracking_number}</span>
                                            <span className="text-muted-foreground">({purchase.order?.carrier || "N/A"})</span>
                                        </a>
                                    ) : null}

                                    {canResumeBuyerShippingFlow ? (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
                                            <p className="text-xs text-amber-800 mb-2">
                                                {stage === "ADDRESS_MISSING"
                                                    ? "Action needed: add your shipping address so the seller can generate your label."
                                                    : stage === "ADDRESS_SET"
                                                        ? "Action needed: select a shipping option so the seller can generate your label."
                                                        : "Action needed: finalize your shipping label for this paid order."}
                                            </p>
                                            <Link href={completeShippingHref} className="text-sm font-semibold text-primary hover:underline">
                                                {stage === "ADDRESS_MISSING"
                                                    ? "Complete shipping details"
                                                    : stage === "ADDRESS_SET"
                                                        ? "Select shipping option"
                                                        : "Finalize shipping label"}
                                            </Link>
                                            {(stage === "ADDRESS_SET" || stage === "OPTION_SELECTED") ? (
                                                <Link href={`${completeShippingHref}&edit=1`} className="ml-3 text-sm font-semibold text-muted-foreground hover:underline">
                                                    Edit shipping details
                                                </Link>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
