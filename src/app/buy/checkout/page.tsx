import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PreCheckoutClient } from "@/components/marketplace/PreCheckoutClient";

export const dynamic = "force-dynamic";

export default async function BuyCheckoutPage({
    searchParams,
}: {
    searchParams: Promise<{ listingId: string }>;
}) {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }

    const { listingId } = await searchParams;
    if (!listingId) {
        redirect("/browse");
    }

    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
            images: {
                orderBy: { imageOrder: "asc" },
                take: 1,
                select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
            },
            user: {
                select: { id: true }
            }
        }
    });

    if (!listing || listing.status !== "AVAILABLE") {
        redirect("/browse");
    }

    if (listing.user_id === session.user.id) {
        redirect(`/listings/${listing.id}`);
    }

    return (
        <div className="container mx-auto px-6 py-12 min-h-[calc(100vh-100px)]">
            <PreCheckoutClient
                listingId={listing.id}
                listingTitle={listing.title}
                listingPrice={Number(listing.price)}
            />
        </div>
    );
}
