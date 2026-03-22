import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getSellerSales } from "@/app/actions/orders";
import { SalesClient } from "@/components/dashboard/SalesClient";
import { serializePurchase } from "@/lib/serialization";
import { TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect("/login");
    }

    const res = await getSellerSales(session.user.id);
    const rawSales = res.success && Array.isArray(res.sales) ? res.sales : [];
    const sales = rawSales.map((sale) => serializePurchase(sale));

    return (
        <div className="space-y-8 max-w-6xl mx-auto py-6">
            <div className="rounded-[1.75rem] border border-border/80 bg-[linear-gradient(135deg,#f3e7de_0%,#eeded3_55%,#e7d2c4_100%)] p-8 md:p-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                    Revenue center
                </div>
                <h1 className="mt-5 font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                    My Sales
                </h1>
                <p className="text-muted-foreground max-w-xl">
                    Manage your sold items, track shipments, and access pre-paid shipping labels in one place.
                </p>
            </div>

            {sales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border text-center px-6 rounded-[1.75rem] bg-card/40">
                    <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-6" />
                    <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">No sales yet</h2>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                        When someone buys your listings, you can manage the orders and shipping here.
                    </p>
                </div>
            ) : (
                <SalesClient sales={sales} />
            )}
        </div>
    );
}
