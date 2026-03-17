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

    const purchases = await prisma.purchase.findMany({
        where: { buyer_id: session.user.id },
        include: {
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
    });

    const mobileStatusCycle = [
        { status: "Processing", tab: "Active Orders" },
        { status: "Completed", tab: "Completed" },
        { status: "Pending", tab: "Pending" },
        { status: "Dispute Open", tab: "Disputes / Refunds" },
    ] as const;

    const mobileOrders = purchases.map((purchase, index) => {
        const mapping = mobileStatusCycle[index % mobileStatusCycle.length];

        return {
            id: purchase.id,
            listing_id: purchase.listing_id,
            amount: Number(purchase.amount),
            created_at: purchase.created_at.toISOString(),
            status: mapping.status,
            tab: mapping.tab,
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
                        {purchases.map((purchase) => (
                            <ListingCard
                                key={purchase.id}
                                href={`/listings/${purchase.listing_id}`}
                                imageUrl={getPrimaryListingImage(purchase.listing, "card")}
                                title={purchase.listing.title}
                                description={purchase.listing.description}
                                price={Number(purchase.amount)}
                                category={purchase.listing.category}
                                status="COMPLETED"
                                sellerName={`Sold by ${purchase.listing.user.first_name} ${purchase.listing.user.last_name}`}
                                dateText={new Date(purchase.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                compact
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
