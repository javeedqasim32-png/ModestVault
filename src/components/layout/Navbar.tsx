import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/Button";

export default async function Navbar() {
    const session = await auth();

    return (
        <header className="sticky top-0 z-50 w-full">
            {/* Top Utility Bar — thin black bar like J. */}
            <div className="bg-primary text-primary-foreground">
                <div className="container mx-auto flex h-9 items-center justify-between px-6 lg:px-10 text-[11px] uppercase tracking-widest">
                    <div className="flex items-center gap-6">
                        {session?.user ? (
                            <>
                                <Link href="/dashboard" className="hover:opacity-70 transition-opacity">
                                    My Account
                                </Link>
                                <form
                                    action={async () => {
                                        "use server";
                                        await signOut();
                                    }}
                                >
                                    <button type="submit" className="hover:opacity-70 transition-opacity">
                                        Sign Out
                                    </button>
                                </form>
                            </>
                        ) : (
                            <>
                                <Link href="/login" className="hover:opacity-70 transition-opacity">
                                    Sign In
                                </Link>
                                <Link href="/signup" className="hover:opacity-70 transition-opacity">
                                    Register
                                </Link>
                            </>
                        )}
                    </div>
                    <div className="hidden md:block text-center font-medium">
                        Welcome to ModestVault
                    </div>
                    <div className="flex items-center gap-6">
                        <Link href="/sell" className="hover:opacity-70 transition-opacity">
                            Sell
                        </Link>
                    </div>
                </div>
            </div>

            {/* Main Header — white bar with centered serif logo */}
            <div className="bg-background border-b border-border">
                <div className="container mx-auto flex flex-col items-center px-6 lg:px-10">
                    {/* Logo */}
                    <div className="py-5">
                        <Link href="/" className="block">
                            <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                                M.
                            </h1>
                        </Link>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex items-center gap-8 pb-4 text-[11px] uppercase tracking-[0.2em] font-medium text-muted-foreground">
                        <Link href="/browse" className="hover:text-foreground transition-colors py-1">
                            Women
                        </Link>
                        <Link href="/browse" className="hover:text-foreground transition-colors py-1">
                            Men
                        </Link>
                        <Link href="/browse" className="hover:text-foreground transition-colors py-1">
                            Accessories
                        </Link>
                        <Link href="/browse" className="hover:text-foreground transition-colors py-1">
                            New Arrivals
                        </Link>
                        <Link href="/browse" className="hover:text-foreground transition-colors py-1 hidden md:block">
                            Collections
                        </Link>
                    </nav>
                </div>
            </div>
        </header>
    );
}
