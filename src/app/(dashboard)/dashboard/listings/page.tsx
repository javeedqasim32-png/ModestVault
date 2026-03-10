import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }

    const listings = await prisma.listing.findMany({
        where: { user_id: session.user.id },
        orderBy: { created_at: "desc" }
    });

    return (
        <div className="space-y-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                        My Listings
                    </h1>
                    <p className="text-muted-foreground">Manage your active and sold inventory.</p>
                </div>
                <Link href="/sell">
                    <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Listing
                    </Button>
                </Link>
            </div>

            {listings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border text-center px-6">
                    <Tag className="w-12 h-12 text-muted-foreground/30 mb-6" />
                    <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">No listings yet</h2>
                    <p className="text-muted-foreground max-w-sm mx-auto mb-8">
                        You haven&apos;t listed anything yet. Turn your fashion into earnings today.
                    </p>
                    <Link href="/sell">
                        <Button variant="outline">Start Selling</Button>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                    {listings.map((listing) => (
                        <Link key={listing.id} href={`/listings/${listing.id}`} className="group block">
                            <div className="relative aspect-[3/4] overflow-hidden bg-muted mb-3">
                                <Image
                                    src={listing.image_url}
                                    alt={listing.title}
                                    fill
                                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                                />
                                <div className="absolute top-3 left-3">
                                    <Badge variant={listing.status === "AVAILABLE" ? "default" : "secondary"}>
                                        {listing.status}
                                    </Badge>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-foreground truncate mb-1">
                                    {listing.title}
                                </h3>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                                    {listing.category}
                                </p>
                                <p className="text-sm font-semibold text-foreground">
                                    ${Number(listing.price).toLocaleString()}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
