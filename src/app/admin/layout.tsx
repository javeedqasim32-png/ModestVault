import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, ShoppingBag, Star } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login?callbackUrl=/admin/listings");
    }

    // Double check admin status against the database for the layout
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { is_admin: true }
    });

    if (!user?.is_admin) {
        redirect("/"); // Non-admins shouldn't even know this exists
    }

    return (
        <div className="flex min-h-screen flex-col bg-[#f7f3ef] lg:flex-row">
            {/* Sidebar — horizontal nav on mobile, vertical rail on desktop. */}
            <aside className="border-b border-border/80 bg-card px-4 py-4 lg:w-64 lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
                <div className="mb-4 lg:mb-10">
                    <Link href="/admin/listings" className="font-serif text-xl font-bold tracking-tight text-foreground lg:text-2xl">
                        Modaire <span className="text-primary">Admin</span>
                    </Link>
                </div>

                <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0 lg:space-y-2 lg:overflow-visible">
                    <Link
                        href="/admin/listings"
                        className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:shadow-sm transition-all lg:gap-3 lg:px-4 lg:py-3"
                    >
                        <Package className="h-5 w-5" />
                        Listings
                    </Link>
                    <Link
                        href="/admin/orders"
                        className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:shadow-sm transition-all lg:gap-3 lg:px-4 lg:py-3"
                    >
                        <ShoppingBag className="h-5 w-5" />
                        Orders
                    </Link>
                    <Link
                        href="/admin/featured"
                        className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:shadow-sm transition-all lg:gap-3 lg:px-4 lg:py-3"
                    >
                        <Star className="h-5 w-5" />
                        Featured
                    </Link>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="w-full min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-8 sm:py-10">
                <div className="mx-auto w-full min-w-0 max-w-6xl">
                    {children}
                </div>
            </main>
        </div>
    );
}
