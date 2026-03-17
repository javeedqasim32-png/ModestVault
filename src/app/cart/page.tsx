import { auth } from "@/auth";
import { createCheckoutSession } from "@/app/actions/checkout";
import { removeCartItem } from "@/app/actions/cart";
import { getPrimaryListingImage } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Trash2, ShoppingBag } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/cart");
  }

  let cartItems: Array<{
    id: string;
    listing: {
      id: string;
      title: string;
      price: unknown;
      status: string;
      image_url: string;
      images: Array<{ imageUrl: string; thumbUrl: string | null; mediumUrl: string | null; imageOrder: number }>;
    };
  }> = [];
  const cartDelegate = (prisma as unknown as {
    cartItem?: {
      findMany: (args: unknown) => Promise<typeof cartItems>;
    };
  }).cartItem;

  if (cartDelegate) {
    try {
      cartItems = await cartDelegate.findMany({
        where: { user_id: session.user.id },
        orderBy: { created_at: "desc" },
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              price: true,
              status: true,
              image_url: true,
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
      });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("CartItem"))) {
        throw error;
      }
    }
  }

  const availableItems = cartItems.filter((item) => item.listing.status === "AVAILABLE");
  const total = availableItems.reduce((sum, item) => sum + Number(item.listing.price), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-serif text-4xl text-foreground sm:text-5xl">Your Bag</h1>
          <span className="text-sm text-muted-foreground">
            {cartItems.length} {cartItems.length === 1 ? "item" : "items"}
          </span>
        </div>

        {cartItems.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border bg-card/70 px-6 py-16 text-center">
            <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
            <p className="text-lg text-muted-foreground">Your bag is empty.</p>
            <Link href="/browse" className="mt-5 inline-flex rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90">
              Explore marketplace
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {cartItems.map((item) => {
                const cover = getPrimaryListingImage(item.listing, "card");
                const unavailable = item.listing.status !== "AVAILABLE";
                return (
                  <div key={item.id} className="grid grid-cols-[110px_1fr] gap-4 rounded-[1.25rem] border border-border/80 bg-card p-3 sm:grid-cols-[130px_1fr]">
                    <Link href={`/listings/${item.listing.id}`} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                      <Image src={cover} alt={item.listing.title} fill className="object-contain bg-card/60 p-1" sizes="140px" />
                    </Link>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/listings/${item.listing.id}`} className="line-clamp-1 text-xl text-foreground hover:underline">
                            {item.listing.title}
                          </Link>
                          <p className="mt-1 text-2xl text-foreground">${Number(item.listing.price).toLocaleString()}</p>
                          {unavailable ? (
                            <p className="mt-1 text-sm text-destructive">This item is no longer available.</p>
                          ) : null}
                        </div>
                        <form action={async () => {
                          "use server";
                          await removeCartItem(item.id);
                        }}>
                          <button
                            type="submit"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                      {unavailable ? null : (
                        <form
                          className="mt-3"
                          action={async () => {
                            "use server";
                            await createCheckoutSession(item.listing.id);
                          }}
                        >
                          <Button type="submit" variant="outline" className="h-10 px-4 text-xs uppercase tracking-[0.18em]">
                            Checkout this item
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <aside className="h-fit rounded-[1.25rem] border border-border/80 bg-card p-5">
              <h2 className="font-serif text-2xl text-foreground">Summary</h2>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Available items</span>
                  <span>{availableItems.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span className="text-foreground">${total.toLocaleString()}</span>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Checkout is currently per item to preserve your existing Stripe listing flow.
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
