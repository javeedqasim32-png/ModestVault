import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default async function ProfileDashboard() {
    const session = await auth();

    // Check if the user is an active seller
    const dbUser = session?.user?.id ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { seller_enabled: true }
    }) : null;

    const isSeller = dbUser?.seller_enabled || false;

    return (
        <div className="space-y-12">
            {/* Header */}
            <div>
                <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                    Account Overview
                </h1>
                <p className="text-muted-foreground">
                    Manage your personal information and seller preferences.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Profile Info */}
                <section className="space-y-6">
                    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Personal Details
                    </h2>
                    <div className="space-y-4">
                        <div className="p-5 border border-border">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Full Name</p>
                            <p className="font-medium text-foreground">{session?.user?.name}</p>
                        </div>
                        <div className="p-5 border border-border">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Email Address</p>
                            <p className="font-medium text-foreground flex items-center gap-2">
                                {session?.user?.email}
                                <ShieldCheck className="w-4 h-4 text-green-600" />
                            </p>
                        </div>
                    </div>
                </section>

                {/* Seller Status */}
                <section className="space-y-6">
                    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Seller Status
                    </h2>
                    {isSeller ? (
                        <div className="p-8 border border-border bg-muted/20">
                            <h3 className="font-serif text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
                                Active Seller <ShieldCheck className="w-5 h-5 text-green-600" />
                            </h3>
                            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                                Your account is verified and connected to Stripe. You are authorized to publish listings and receive payouts.
                            </p>
                            <Link href="/sell">
                                <Button className="w-full sm:w-auto">
                                    Create New Listing
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="p-8 bg-primary text-primary-foreground">
                            <h3 className="font-serif text-xl font-semibold mb-2">Ready to list?</h3>
                            <p className="text-primary-foreground/60 text-sm mb-6 max-w-[220px] leading-relaxed">
                                Join our community of sellers and turn your style into earnings.
                            </p>
                            <Link href="/sell">
                                <Button variant="outline" className="border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary">
                                    Start Selling
                                </Button>
                            </Link>
                        </div>
                    )}
                </section>
            </div>

            {/* Stats */}
            <div className="pt-10 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-8">
                {[
                    { label: "Total Purchases", value: "0" },
                    { label: "Active Listings", value: "0" },
                    { label: "Total Sales", value: "0" },
                ].map((stat) => (
                    <div key={stat.label} className="text-center py-6">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{stat.label}</p>
                        <p className="font-serif text-4xl font-bold text-foreground">{stat.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
