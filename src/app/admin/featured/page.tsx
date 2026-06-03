import { prisma } from "@/lib/prisma";
import { getPrimaryListingImage } from "@/lib/listing-images";
import AdminFeaturedClient from "./AdminFeaturedClient";

export const dynamic = "force-dynamic";

export default async function AdminFeaturedPage() {
    const featured = await prisma.listing.findMany({
        where: { is_featured: true, status: "AVAILABLE", moderation_status: "APPROVED" },
        // Same sort as the Home rail so what the admin sees matches what's live.
        orderBy: [{ featured_order: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
            user: { select: { first_name: true, last_name: true } },
        },
    });

    const items = featured.map((listing) => ({
        id: listing.id,
        title: listing.title,
        price: Number(listing.price),
        image_url: getPrimaryListingImage(listing, "card"),
        seller_name: `${listing.user.first_name} ${listing.user.last_name}`.trim(),
    }));

    return <AdminFeaturedClient initialItems={items} />;
}
