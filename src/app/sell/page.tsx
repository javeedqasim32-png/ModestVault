import { serializeListing } from "@/lib/serialization";
import { auth } from "@/auth";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import SellPageClient from "./SellPageClient";

export default async function SellPage() {
    const session = await auth();

    // If logged-out user clicks Sell, redirect them to login/signup
    if (!session?.user?.id) {
        redirect("/login?callbackUrl=/sell");
    }

    // Check user's latest seller status from the database
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { seller_enabled: true }
    });

    if (!user) {
        redirect("/login?callbackUrl=/sell");
    }

    const listings = user.seller_enabled
        ? await prisma.listing.findMany({
            where: { user_id: session.user.id },
            orderBy: { created_at: "desc" },
            include: {
                images: {
                    orderBy: { imageOrder: "asc" },
                    take: 1,
                    select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
                },
                purchases: {
                    include: { order: true },
                    take: 1
                }
            },
        })
        : [];

    const safeListings = listings.map((listing) => {
        const order = listing.purchases?.[0]?.order;
        const serialized = serializeListing(listing);
        return {
            id: serialized.id,
            title: serialized.title,
            description: serialized.description,
            price: serialized.price,
            status: serialized.status,
            moderation_status: serialized.moderation_status,
            rejection_reason: serialized.rejection_reason,
            image_url: getPrimaryListingImage(listing, "card"),
            label_url: order?.label_url || null,
        };
    });

    return <SellPageClient isSellerInitially={user.seller_enabled} listings={safeListings} />;
}
