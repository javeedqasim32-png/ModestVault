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

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            first_name: true,
            last_name: true,
            phone: true,
            street1: true,
            street2: true,
            city: true,
            state: true,
            zip: true,
            country: true,
        }
    });

    const initialAddress = user ? {
        name: `${user.first_name} ${user.last_name}`.trim(),
        line1: user.street1 || "",
        line2: user.street2 || "",
        city: user.city || "",
        state: user.state || "",
        postal_code: user.zip || "",
        country: user.country || "US",
        phone: user.phone || "",
    } : undefined;

    return (
        <div className="container mx-auto px-6 py-12 min-h-[calc(100vh-100px)]">
            <PreCheckoutClient
                listingId={listing.id}
                listingTitle={listing.title}
                listingPrice={Number(listing.price)}
                initialAddress={initialAddress}
            />
        </div>
    );
}
