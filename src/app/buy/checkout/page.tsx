import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import localFont from "next/font/local";
import { PreCheckoutClient } from "@/components/marketplace/PreCheckoutClient";
import { getPrimaryListingImage } from "@/lib/listing-images";
import {
    getEffectivePriceForListing,
    getEffectivePricesForListings,
} from "@/lib/promotions/get-effective-price";

export const dynamic = "force-dynamic";

const BUNDLE_MAX_ITEMS = 10;

const cormorantHeading = localFont({
    src: [
        { path: "../../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
        { path: "../../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
    ],
    display: "swap",
});

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

        // Promotion pricing per bundle line — mirrors checkout server-side
        // so what buyer sees in this preview matches Stripe.
        const bundleEffectivePrices = await getEffectivePricesForListings(
            listings.map((l) => ({ id: l.id, price: l.price as unknown as number, status: l.status })),
        );

        const bundleItems = listings.map((l) => {
            const ep = bundleEffectivePrices.get(l.id);
            const effective = ep ? ep.effectiveCents / 100 : Number(l.price);
            return {
                id: l.id,
                title: l.title,
                price: effective,
                imageUrl: getPrimaryListingImage(l, "card"),
            };
        });
        const firstListingEffective = bundleEffectivePrices.get(listings[0].id);
        const firstListingPriceCents = firstListingEffective?.effectiveCents;
        const firstListingPrice = firstListingPriceCents !== undefined
            ? firstListingPriceCents / 100
            : Number(listings[0].price);

        return (
            <div className="min-h-screen overflow-x-hidden bg-[#f4efea] pb-24 pt-4 sm:pb-12 sm:pt-8">
                <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6">
                    <PreCheckoutClient
                        listingId={listings[0].id}
                        listingTitle={listings[0].title}
                        listingPrice={firstListingPrice}
                        listingImageUrl={getPrimaryListingImage(listings[0], "card")}
                        bundleItems={bundleItems}
                        initialAddress={initialAddress}
                        headingClassName={cormorantHeading.className}
                    />
                </div>
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

    // Effective price mirrors checkout server-side — buyer sees what Stripe
    // will actually charge, not the original.
    const effectivePrice = await getEffectivePriceForListing(listing.id);
    const listingPrice = effectivePrice.effectiveCents / 100;

    return (
        <div className="min-h-screen overflow-x-hidden bg-[#f4efea] pb-24 pt-4 sm:pb-12 sm:pt-8">
            <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6">
                <PreCheckoutClient
                    listingId={listing.id}
                    listingTitle={listing.title}
                    listingPrice={listingPrice}
                    listingImageUrl={getPrimaryListingImage(listing, "card")}
                    initialAddress={initialAddress}
                    headingClassName={cormorantHeading.className}
                />
            </div>
        </div>
    );
}
