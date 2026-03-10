import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { CheckCircle2, ShoppingBag, ArrowRight, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function BuySuccessPage({ searchParams }: { searchParams: Promise<{ session_id: string; listingId: string }> }) {
    const { session_id, listingId } = await searchParams;
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (!session_id || !listingId) {
        redirect("/browse");
    }

    // 1. Verify the checkout session with Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);

    if (checkoutSession.payment_status === "paid") {
        const existingPurchase = await prisma.purchase.findUnique({
            where: { stripe_session_id: session_id }
        });

        if (!existingPurchase) {
            try {
                await prisma.$transaction(async (tx) => {
                    const updatedListing = await tx.listing.updateMany({
                        where: { id: listingId, status: "AVAILABLE" },
                        data: { status: "SOLD" }
                    });

                    if (updatedListing.count === 0) {
                        throw new Error("ALREADY_SOLD");
                    }

                    await tx.purchase.create({
                        data: {
                            buyer_id: session.user?.id || "",
                            listing_id: listingId,
                            amount: (checkoutSession.amount_total || 0) / 100,
                            stripe_session_id: session_id,
                        }
                    });
                });
            } catch (error: any) {
                if (error.message === "ALREADY_SOLD") {
                    return (
                        <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
                            <div className="max-w-xl w-full text-center space-y-10 group">
                                <div className="w-24 h-24 bg-amber-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border-4 border-white shadow-xl ring-1 ring-amber-100/50 transform group-hover:rotate-12 transition-transform duration-700">
                                    <AlertCircle className="w-12 h-12 text-amber-500" />
                                </div>
                                <div className="space-y-4">
                                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-none font-black uppercase text-[10px] tracking-widest px-4 py-1.5 rounded-full">
                                        Inventory Update
                                    </Badge>
                                    <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-foreground">
                                        Rare Piece <span className="text-muted-foreground">Already Claimed</span>
                                    </h1>
                                    <p className="text-muted-foreground font-medium text-lg leading-relaxed max-w-md mx-auto italic">
                                        In the time it took to secure your order, another collector completed theirs for this unique item.
                                    </p>
                                </div>

                                <Card className="p-8 border-amber-100 bg-amber-50/30 rounded-[2rem] text-left">
                                    <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
                                        <ShieldCheck className="w-5 h-5 text-amber-600" />
                                        Your funds are safe
                                    </h3>
                                    <p className="text-sm text-amber-800 leading-relaxed font-medium">
                                        Since the item is no longer available, we've automatically triggered a full reversal of your payment. Funds will reappear in your account within 3-5 business days.
                                    </p>
                                </Card>

                                <Link href="/browse">
                                    <Button size="lg" className="px-12 rounded-2xl font-black text-lg shadow-xl shadow-amber-500/10">
                                        Find Your Next Treasure
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    );
                }
                throw error;
            }
        }
    } else {
        return (
            <div className="container mx-auto px-6 py-24 text-center min-h-[calc(100vh-100px)] flex flex-col justify-center items-center">
                <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
                    <AlertCircle className="w-10 h-10 text-destructive" />
                </div>
                <h1 className="text-3xl font-black tracking-tighter text-foreground mb-4">Payment Incomplete</h1>
                <p className="text-muted-foreground font-medium max-w-sm mx-auto mb-10">
                    We couldn't confirm your payment status. Please verify your details or contact support.
                </p>
                <Link href="/browse">
                    <Button variant="ghost" className="font-bold text-muted-foreground hover:text-foreground">
                        Return to Marketplace
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-6 py-24 flex justify-center items-center min-h-[calc(100vh-100px)]">
            <div className="max-w-2xl w-full text-center space-y-12">
                <div className="relative group">
                    <div className="w-28 h-28 bg-primary/10 rounded-[3rem] flex items-center justify-center mx-auto mb-8 border-4 border-white shadow-2xl ring-1 ring-primary/20 transform group-hover:scale-110 transition-transform duration-700">
                        <CheckCircle2 className="w-14 h-14 text-primary" />
                    </div>
                    <div className="absolute top-0 right-1/4 animate-bounce delay-100">
                        <Sparkles className="w-6 h-6 text-primary opacity-40" />
                    </div>
                </div>

                <div className="space-y-4">
                    <Badge variant="success" className="bg-primary/10 text-primary border-none font-black uppercase text-[10px] tracking-widest px-6 py-1.5 rounded-full shadow-sm">
                        Secured Successfully
                    </Badge>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-foreground">
                        Welcome Your <span className="text-muted-foreground">New Piece</span>
                    </h1>
                    <p className="text-xl text-muted-foreground font-medium max-w-lg mx-auto leading-relaxed">
                        Order confirmed. The curated selection you chose is now officially yours.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-md mx-auto">
                    <Link href="/dashboard/purchases">
                        <Button variant="primary" size="lg" className="w-full rounded-[2rem] font-black group shadow-2xl shadow-primary/20">
                            <ShoppingBag className="w-5 h-5 mr-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                            Order History
                        </Button>
                    </Link>

                    <Link href="/browse">
                        <Button variant="secondary" size="lg" className="w-full rounded-[2rem] font-bold border border-border shadow-sm group">
                            Keep Exploring
                            <ArrowRight className="w-5 h-5 ml-3 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </Button>
                    </Link>
                </div>

                <div className="pt-12 border-t border-border/50">
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] opacity-40">
                        Confirmation Dispatched to <span className="text-foreground opacity-100"> {session.user.email} </span>
                    </p>
                </div>
            </div>
        </div>
    );
}
