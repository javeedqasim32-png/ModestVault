import { TrendingUp } from "lucide-react";

export default function SalesPage() {
    return (
        <div className="space-y-10">
            <div>
                <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                    My Sales
                </h1>
                <p className="text-muted-foreground">Manage and track your successfully sold items.</p>
            </div>

            <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border text-center px-6">
                <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-6" />
                <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">No sales yet</h2>
                <p className="text-muted-foreground max-w-sm mx-auto">
                    When someone buys your listings, you can manage the orders and shipping here.
                </p>
            </div>
        </div>
    );
}
