import { prisma } from "@/lib/prisma";
import AdminListingsClient from "./AdminListingsClient";
import { serializeListing } from "@/lib/serialization";

export const dynamic = "force-dynamic";

export default async function AdminListingsPage() {
    // Fetch all listings with basic user info
    const listings = await prisma.listing.findMany({
        include: {
            user: {
                select: {
                    first_name: true,
                    last_name: true,
                }
            },
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true }
            }
        },
        orderBy: { created_at: "desc" }
    });

    const formattedListings = listings.map(listing => {
        const serialized = serializeListing(listing);
        return {
            ...serialized,
            image_url: listing.images[0]?.mediumUrl || listing.images[0]?.imageUrl || "/placeholder.svg",
            sellerName: `${listing.user.first_name} ${listing.user.last_name}`,
        };
    });

    return (
        <div className="mt-4">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-8">Listing Moderation</h1>
            <AdminListingsClient initialListings={formattedListings} />
        </div>
    );
}
