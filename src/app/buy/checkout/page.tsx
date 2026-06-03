import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PreCheckoutClient } from "@/components/marketplace/PreCheckoutClient";

export const dynamic = "force-dynamic";

const BUNDLE_MAX_ITEMS = 10;

export default async function BuyCheckoutPage({
    searchParams,
}: {
    searchParams: Promise<{ listingId?: string; bundleIds?: string }>;
}) {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }
    const sessionUserId = session.user.id;

    const { listingId, bundleIds } = await searchParams;

    // Bundle mode: ?bundleIds=ID1,ID2,ID3 — same-seller multi-item checkout.
    if (bundleIds) {
        const ids = Array.from(
            new Set(
                bundleIds
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
            )
        );
        if (ids.length < 2 || ids.length > BUNDLE_MAX_ITEMS) {
            redirect("/cart");
        }

        const listings = await prisma.listing.findMany({
            where: { id: { in: ids } },
            include: {
                images: {
                    orderBy: { imageOrder: "asc" },
                    take: 1,
                    select: { imageUrl: true, thumbUrl: true, mediumUrl: true, imageOrder: true },
                },
                user: { select: { id: true } },
            },
        });

        // Guard rails — same-seller, all available, not own listings, count matches.
        const sellerIds = new Set(listings.map((l) => l.user_id));
        const allAvailable = listings.every((l) => l.status === "AVAILABLE");
        const noneOwn = listings.every((l) => l.user_id !== sessionUserId);
        if (
            listings.length !== ids.length ||
            sellerIds.size !== 1 ||
            !allAvailable ||
            !noneOwn
        ) {
            redirect("/cart");
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
            },
        });

        const initialAddress = user
            ? {
                  name: `${user.first_name} ${user.last_name}`.trim(),
                  line1: user.street1 || "",
                  line2: user.street2 || "",
                  city: user.city || "",
                  state: user.state || "",
                  postal_code: user.zip || "",
                  country: user.country || "US",
                  phone: user.phone || "",
              }
            : undefined;

        const bundleItems = listings.map((l) => ({
            id: l.id,
            title: l.title,
            price: Number(l.price),
        }));

        return (
            <div className="container mx-auto px-6 py-12 min-h-[calc(100vh-100px)]">
                <PreCheckoutClient
                    listingId={listings[0].id}
                    listingTitle={listings[0].title}
                    listingPrice={Number(listings[0].price)}
                    bundleItems={bundleItems}
                    initialAddress={initialAddress}
                />
            </div>
        );
    }

    // Single-item mode (existing path, unchanged).
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
