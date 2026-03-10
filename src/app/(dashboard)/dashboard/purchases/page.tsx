import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";
import { Calendar, ShoppingBag } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

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

    return (
        <div className="space-y-10">
            <div>
                <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                    My Purchases
                </h1>
                <p className="text-muted-foreground">Track and manage your order history.</p>
            </div>

            {purchases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border text-center px-6">
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
                <div className="space-y-0 border-t border-border">
                    {purchases.map((purchase: any) => (
                        <Link key={purchase.id} href={`/listings/${purchase.listing_id}`} className="block group">
                            <div className="flex items-center gap-6 py-6 border-b border-border hover:bg-muted/20 transition-colors px-2">
                                {/* Image */}
                                <div className="relative w-20 h-20 overflow-hidden bg-muted shrink-0">
                                    <Image
                                        src={purchase.listing.image_url}
                                        alt={purchase.listing.title}
                                        fill
                                        className="object-cover"
                                    />
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-medium text-foreground truncate group-hover:opacity-70 transition-opacity">
                                        {purchase.listing.title}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Sold by {purchase.listing.user.first_name} {purchase.listing.user.last_name}
                                    </p>
                                </div>

                                {/* Status */}
                                <Badge variant="outline" className="hidden sm:inline-flex">
                                    Completed
                                </Badge>

                                {/* Price */}
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-semibold text-foreground">
                                        ${Number(purchase.amount).toLocaleString()}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {new Date(purchase.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
