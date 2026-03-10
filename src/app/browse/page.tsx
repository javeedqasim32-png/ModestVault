import { prisma } from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";
import { Search, Package, ArrowRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
    const listings = await prisma.listing.findMany({
        where: { status: "AVAILABLE" },
        orderBy: { created_at: "desc" },
    });

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-6 lg:px-10 py-12 md:py-16">
                {/* Header */}
                <div className="mb-12">
                    <h1 className="font-serif text-4xl md:text-6xl font-bold text-foreground mb-4">
                        Shop All
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-lg">
                        A curated collection of unique, high-quality modest fashion from sellers worldwide.
                    </p>
                </div>

                {/* Layout */}
                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Sidebar Filters */}
                    <aside className="w-full lg:w-56 flex-shrink-0">
                        <div className="sticky top-40 space-y-8">
                            <div>
                                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-5">
                                    Categories
                                </h3>
                                <ul className="space-y-3">
                                    {["All", "Dresses", "Tops", "Outerwear", "Bottoms", "Accessories"].map((cat) => (
                                        <li key={cat}>
                                            <button className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1">
                                                {cat}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="border-t border-border pt-8">
                                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-5">
                                    Condition
                                </h3>
                                <ul className="space-y-3">
                                    {["New", "Like New", "Good", "Fair"].map((cond) => (
                                        <li key={cond}>
                                            <button className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1">
                                                {cond}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="border-t border-border pt-8">
                                <Link href="/sell">
                                    <Button variant="outline" size="sm" className="w-full">
                                        <Plus className="w-3 h-3 mr-2" />
                                        Start Selling
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </aside>

                    {/* Product Grid */}
                    <div className="flex-1">
                        {/* Search */}
                        <div className="relative mb-10">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                placeholder="Search items, brands, or styles..."
                                className="w-full pl-12 pr-4 py-4 text-sm border border-border bg-background focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>

                        {listings.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-32 border border-dashed border-border text-center px-6">
                                <Package className="w-12 h-12 text-muted-foreground/30 mb-6" />
                                <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">No items found</h2>
                                <p className="text-muted-foreground max-w-xs mx-auto mb-8">
                                    Try adjusting your search or check back later for new arrivals.
                                </p>
                                <Button variant="outline">Reset Filters</Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-12">
                                {listings.map((listing) => (
                                    <Link
                                        href={`/listings/${listing.id}`}
                                        key={listing.id}
                                        className="group block"
                                    >
                                        {/* Image */}
                                        <div className="relative aspect-[3/4] overflow-hidden bg-muted mb-4">
                                            <Image
                                                src={listing.image_url}
                                                alt={listing.title}
                                                fill
                                                className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                                                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                                            />
                                        </div>

                                        {/* Info */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge variant="outline" className="text-[9px]">
                                                    {listing.category}
                                                </Badge>
                                                {listing.condition && (
                                                    <Badge variant="secondary" className="text-[9px]">
                                                        {listing.condition}
                                                    </Badge>
                                                )}
                                            </div>
                                            <h3 className="text-sm font-medium text-foreground truncate mb-1">
                                                {listing.title}
                                            </h3>
                                            <p className="text-sm font-semibold text-foreground">
                                                ${Number(listing.price).toLocaleString()}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
