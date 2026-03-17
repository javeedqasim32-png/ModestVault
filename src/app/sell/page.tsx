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
            },
        })
        : [];

    const safeListings = listings.map((listing) => ({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        price: Number(listing.price),
        image_url: getPrimaryListingImage(listing, "card"),
        status: listing.status,
    }));

    return <SellPageClient isSellerInitially={user.seller_enabled} listings={safeListings} />;
}
