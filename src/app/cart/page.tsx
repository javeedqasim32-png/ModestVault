import { serializeListing } from "@/lib/serialization";
import { auth } from "@/auth";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import { getEffectivePricesForListings } from "@/lib/promotions/get-effective-price";
import { getUserSlugMap } from "@/lib/user-slugs";
import { redirect } from "next/navigation";
import Link from "next/link";
import localFont from "next/font/local";
import { ShoppingBag } from "lucide-react";
import SellerCartSection from "@/components/cart/SellerCartSection";

const BUNDLE_MAX_ITEMS = 10;

export const dynamic = "force-dynamic";

const cormorantHeading = localFont({
  src: [
    { path: "../../fonts/CormorantGaramond-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../fonts/CormorantGaramond-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  display: "swap",
});

export default async function CartPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/cart");
  }
  const sessionUserId = session.user.id;

  let cartItems: Array<{
    id: string;
    listing: {
      id: string;
      title: string;
      price: unknown;
      status: string;
      category: string | null;
      size: string | null;
      brand: string | null;
      image_url: string;
      user_id: string;
      user: { id: string; first_name: string; last_name: string } | null;
      images: Array<{ imageUrl: string; thumbUrl: string | null; mediumUrl: string | null; imageOrder: number }>;
    };
  }> = [];
  const cartDelegate = (prisma as unknown as {
    cartItem?: {
      deleteMany: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<typeof cartItems>;
    };
  }).cartItem;

  if (cartDelegate) {
    try {
      // Keep cart clean by removing sold/unavailable items (including purchased listings).
      await cartDelegate.deleteMany({
        where: {
          user_id: session.user.id,
          listing: {
            status: {
              not: "AVAILABLE",
            },
          },
        },
      });

      cartItems = (await cartDelegate.findMany({
        where: { user_id: session.user.id },
        orderBy: { created_at: "desc" },
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              price: true,
              status: true,
              category: true,
              size: true,
              brand: true,
              image_url: true,
              user_id: true,
              user: { select: { id: true, first_name: true, last_name: true } },
              images: {
                orderBy: { imageOrder: "asc" },
                select: {
                  imageUrl: true,
                  thumbUrl: true,
                  mediumUrl: true,
                  imageOrder: true,
                },
              },
            },
          },
        },
      })).map((item) => ({
        ...item,
        listing: serializeListing(item.listing)
      }));
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("CartItem"))) {
        throw error;
      }
    }
  }

  const availableItems = cartItems.filter((item) => item.listing.status === "AVAILABLE");

  // Resolve promotion pricing for every AVAILABLE cart listing in one
  // round-trip. Uses the same helper checkout uses server-side, so what
  // shows in the bag subtotal is what Stripe will actually charge.
  const cartEffectivePrices = await getEffectivePricesForListings(
    availableItems.map((item) => ({
      id: item.listing.id,
      price: item.listing.price as number,
      status: item.listing.status,
    })),
  );

  // Group AVAILABLE cart items by seller. The cart UI renders one card per
  // seller, each with its own "Checkout All Items" button. A single server
  // action (createCheckoutForSellerGroup) auto-routes single-item groups
  // through the single-item checkout flow and multi-item groups through the
  // bundle flow (consolidated shipping).
  const sellerGroupsMap = new Map<string, typeof availableItems>();
  for (const item of availableItems) {
    const sellerId = item.listing.user_id;
    const existing = sellerGroupsMap.get(sellerId);
    if (existing) existing.push(item);
    else sellerGroupsMap.set(sellerId, [item]);
  }
  const slugMap = await getUserSlugMap();
  // First-encountered seller order preserves the existing newest-first sort.
  // We pre-compute the cover image server-side so the client component has
  // a flat, simple shape to render.
  const sellerGroups = Array.from(sellerGroupsMap.entries()).map(([sellerId, items]) => {
    const user = items[0].listing.user;
    const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : "Seller";
    const initials = user
      ? `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`.toUpperCase() || "S"
      : "S";
    return {
      sellerId,
      sellerName: fullName || "Seller",
      sellerInitials: initials,
      sellerSlug: slugMap.get(sellerId) || sellerId,
      items: items.map((item) => {
        const ep = cartEffectivePrices.get(item.listing.id);
        const originalPrice = Number(item.listing.price);
        return {
          id: item.id,
          listing: {
            id: item.listing.id,
            title: item.listing.title,
            price: originalPrice,
            effectivePrice: ep ? ep.effectiveCents / 100 : originalPrice,
            discountPercent: ep?.discountPercent ?? 0,
            category: item.listing.category,
            size: item.listing.size,
            brand: item.listing.brand,
            coverImage: getPrimaryListingImage(item.listing, "card"),
          },
        };
      }),
    };
  });

  return (
    <div className="min-h-screen bg-[#f4efea] pb-24 pt-4 sm:pb-12">
      <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6">
        {/* "Your Bag" header card */}
        <div className="mb-3 rounded-[1.65rem] border border-[#ddd3cb] bg-[#fbf8f5] px-5 py-4">
          <p className={`${cormorantHeading.className} text-[23px] font-semibold leading-[1.05] text-foreground`}>
            Your Bag
          </p>
          <p className="mt-1.5 text-[0.92rem] leading-[1.25] text-[#8a7667]">
            {cartItems.length} {cartItems.length === 1 ? "item" : "items"}
            {cartItems.length > 0 ? " · Select items to checkout" : " · Tap to start shopping"}
          </p>
        </div>

        {cartItems.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-[#ddd3cb] bg-[#fbf8f5] px-5 py-12 text-center">
            <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-[#8a7667]/50" />
            <p className="text-base text-[#8a7667]">Your bag is empty.</p>
            <Link
              href="/browse"
              className="mx-auto mt-4 inline-flex items-center rounded-full bg-[#5f4437] px-4 py-2 text-sm text-white"
            >
              Explore marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {sellerGroups.map((group) => (
              <SellerCartSection
                key={group.sellerId}
                sellerId={group.sellerId}
                sellerName={group.sellerName}
                sellerInitials={group.sellerInitials}
                sellerSlug={group.sellerSlug}
                items={group.items}
                bundleMaxItems={BUNDLE_MAX_ITEMS}
                currentUserId={sessionUserId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
