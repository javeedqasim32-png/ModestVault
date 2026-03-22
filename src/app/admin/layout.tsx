import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, ShoppingBag } from "lucide-react";

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
        <div className="flex min-h-screen bg-[#f7f3ef]">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border/80 bg-card px-6 py-8">
                <div className="mb-10">
                    <Link href="/admin/listings" className="font-serif text-2xl font-bold tracking-tight text-foreground">
                        Modaire <span className="text-primary">Admin</span>
                    </Link>
                </div>

                <nav className="space-y-2">
                    <Link
                        href="/admin/listings"
                        className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:shadow-sm transition-all"
                    >
                        <Package className="h-5 w-5" />
                        Listings
                    </Link>
                    <Link
                        href="/admin/orders"
                        className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:shadow-sm transition-all"
                    >
                        <ShoppingBag className="h-5 w-5" />
                        Orders
                    </Link>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 px-8 py-10">
                <div className="mx-auto max-w-6xl">
                    {children}
                </div>
            </main>
        </div>
    );
}
