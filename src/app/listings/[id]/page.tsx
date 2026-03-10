import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { createCheckoutSession } from "@/app/actions/checkout";
import { ShieldCheck, Truck, ShoppingCart, ChevronLeft, Share2, Heart } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();

    const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
            user: {
                select: {
                    first_name: true,
                    last_name: true,
                    profile_image: true,
                }
            }
        }
    });

    if (!listing) {
        notFound();
    }

    const isOwner = session?.user?.id === listing.user_id;
    const isAvailable = listing.status === "AVAILABLE";

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-6 lg:px-10 py-8 lg:py-12">
                {/* Back Link */}
                <div className="flex items-center justify-between mb-8">
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back to Shop
                    </Link>
                    <div className="flex gap-3">
                        <button className="text-muted-foreground hover:text-foreground transition-colors">
                            <Share2 className="w-5 h-5" />
                        </button>
                        <button className="text-muted-foreground hover:text-foreground transition-colors">
                            <Heart className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-20">
                    {/* Product Image */}
                    <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                        <Image
                            src={listing.image_url}
                            alt={listing.title}
                            fill
                            className="object-cover"
                            priority
                        />
                        {listing.status === "SOLD" && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <span className="text-white text-2xl font-semibold uppercase tracking-widest">
                                    Sold
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div className="lg:pt-8">
                        <div className="sticky top-40 space-y-8">
                            {/* Badges */}
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{listing.category}</Badge>
                                <Badge variant="secondary">{listing.condition || "New"}</Badge>
                            </div>

                            {/* Title */}
                            <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                                {listing.title}
                            </h1>

                            {/* Price */}
                            <div className="flex items-baseline gap-3">
                                <span className="text-3xl font-semibold text-foreground">
                                    ${Number(listing.price).toLocaleString()}
                                </span>
                                <span className="text-sm text-muted-foreground uppercase tracking-wider">
                                    USD
                                </span>
                            </div>

                            {/* Description */}
                            <div className="border-t border-border pt-8 space-y-3">
                                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Description
                                </h3>
                                <p className="text-muted-foreground leading-relaxed">
                                    {listing.description}
                                </p>
                            </div>

                            {/* Seller */}
                            <div className="border-t border-border pt-8">
                                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                                    Seller
                                </h3>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-muted overflow-hidden flex items-center justify-center">
                                        {listing.user.profile_image ? (
                                            <Image src={listing.user.profile_image} alt={`${listing.user.first_name}`} width={48} height={48} className="object-cover w-full h-full" />
                                        ) : (
                                            <span className="text-lg font-semibold text-muted-foreground">
                                                {listing.user.first_name?.[0]}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">
                                            {listing.user.first_name} {listing.user.last_name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Verified Seller</p>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="border-t border-border pt-8 space-y-4">
                                {isAvailable ? (
                                    isOwner ? (
                                        <Link href="/dashboard/listings" className="block">
                                            <Button variant="outline" className="w-full py-4 text-sm">
                                                Manage Your Listing
                                            </Button>
                                        </Link>
                                    ) : (
                                        <form action={async () => {
                                            "use server";
                                            await createCheckoutSession(listing.id);
                                        }}>
                                            <Button type="submit" className="w-full py-4 text-sm">
                                                <ShoppingCart className="w-4 h-4 mr-2" />
                                                Add to Bag
                                            </Button>
                                        </form>
                                    )
                                ) : (
                                    <Button disabled className="w-full py-4 text-sm bg-muted text-muted-foreground border border-border">
                                        Sold Out
                                    </Button>
                                )}

                                {/* Trust Signals */}
                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <div className="flex items-center gap-3 py-3">
                                        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Authentic</span>
                                    </div>
                                    <div className="flex items-center gap-3 py-3">
                                        <Truck className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Free Shipping</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
