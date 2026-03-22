import Link from "next/link";
import { auth, signOut } from "@/auth";
import { getCartCountForSessionUser } from "@/app/actions/cart";
import { getFavoriteCountForSessionUser } from "@/app/actions/favorites";
import { Heart, Search, ShoppingBag } from "lucide-react";
import Image from "next/image";

export default async function Navbar() {
    const session = await auth();
    const cartCount = await getCartCountForSessionUser();
    const favoriteCount = await getFavoriteCountForSessionUser();

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-[#f7f3ef]/95 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[1360px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex min-w-0 items-center gap-3 sm:border-r sm:border-border/80 sm:pr-8">
                    <div className="flex items-center">
                        <Image
                            src="/logo.png"
                            alt="Modaire"
                            width={240}
                            height={80}
                            className="h-12 w-auto sm:h-16 lg:h-20 mix-blend-multiply transition-transform duration-300 translate-y-1 hover:scale-[1.02]"
                            priority
                        />
                    </div>
                </Link>

                <div className="hidden flex-1 items-center gap-3 rounded-full border border-border bg-card px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] lg:flex">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                        aria-label="Search"
                        placeholder="Search designers, abayas, pret..."
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                </div>

                <div className="ml-auto flex items-center gap-1 sm:gap-2">
                    <Link href="/favorites" className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary">
                        <Heart className="h-5 w-5" />
                        {favoriteCount > 0 ? (
                            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                                {favoriteCount > 99 ? "99+" : favoriteCount}
                            </span>
                        ) : null}
                    </Link>
                    <Link href="/cart" className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary">
                        <ShoppingBag className="h-5 w-5" />
                        {cartCount > 0 ? (
                            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                                {cartCount > 99 ? "99+" : cartCount}
                            </span>
                        ) : null}
                    </Link>
                    {session?.user ? (
                        null
                    ) : (
                        <div className="hidden items-center gap-2 sm:flex">
                            <Link href="/login" className="rounded-full px-4 py-2 text-sm text-foreground hover:bg-secondary">
                                Sign in
                            </Link>
                            <Link href="/signup" className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">
                                Create account
                            </Link>
                        </div>
                    )}
                    <div className="hidden border-l border-border/80 pl-3 sm:block">
                        {session?.user ? (
                            <form
                                action={async () => {
                                    "use server";
                                    await signOut();
                                }}
                            >
                                <button type="submit" className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
                                    Log out
                                </button>
                            </form>
                        ) : (
                            <Link href="/sell" className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
                                Sell
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            <div className="mx-auto hidden w-full max-w-[1360px] items-center justify-between px-6 pb-4 text-[11px] uppercase tracking-[0.28em] text-muted-foreground lg:flex">
                <div className="flex items-center gap-8">
                    <Link href="/browse" className="hover:text-foreground">
                        Everyday Modest
                    </Link>
                    <Link href="/browse" className="hover:text-foreground">
                        Luxury Pret
                    </Link>
                    <Link href="/browse" className="hover:text-foreground">
                        Formal Wear
                    </Link>
                    <Link href="/browse" className="hover:text-foreground">
                        Bridal
                    </Link>
                </div>
                <div className="flex items-center gap-6">
                    {session?.user ? (
                        <>
                            {(session.user as { isAdmin?: boolean }).isAdmin && (
                                <Link href="/admin/listings" className="font-semibold text-primary hover:text-primary/80">
                                    Admin Dashboard
                                </Link>
                            )}
                            <Link href="/dashboard/purchases" className="hover:text-foreground">
                                Purchases
                            </Link>
                            <Link href="/dashboard/settings" className="hover:text-foreground">
                                Settings
                            </Link>
                            <Link href="/sell" className="hover:text-foreground">
                                Sell
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href="/signup" className="hover:text-foreground">
                                Join marketplace
                            </Link>
                            <Link href="/sell" className="hover:text-foreground">
                                Become a seller
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
