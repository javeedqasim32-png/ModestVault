"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package, Printer, Search, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SellerRateSelector } from "./SellerRateSelector";
import { X } from "lucide-react";

type SaleItem = {
    id: string;
    amount: number;
    created_at: Date;
    buyer: {
        first_name: string;
        last_name: string;
        email: string;
    };
    listing: {
        id: string;
        title: string;
        images: { imageUrl: string }[];
    };
    order: {
        id: string;
        shipping_status: string;
        tracking_number?: string | null;
        carrier?: string | null;
        label_url?: string | null;
    } | null;
};

export function SalesClient({ sales }: { sales: SaleItem[] }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const filteredSales = sales.filter(sale =>
        sale.listing.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.buyer.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.buyer.last_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search sales by item or buyer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-full border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{filteredSales.length}</span>
                    <span>{filteredSales.length === 1 ? 'sale' : 'sales'} found</span>
                </div>
            </div>

            {filteredSales.length === 0 ? (
                <Card className="p-12 text-center border-dashed border-border/60">
                    <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground/40">
                        <Package className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-serif font-bold mb-2">No sales matching your search</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto mb-6">Try searching for a different item title or buyer name.</p>
                    <Button variant="outline" onClick={() => setSearchTerm("")}>Clear search</Button>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filteredSales.map((sale) => (
                        <Card key={sale.id} className="p-0 overflow-hidden border-border/60 hover:border-primary/20 transition-all group">
                            <div className="flex flex-col md:flex-row md:items-center">
                                {/* Image Section */}
                                <div className="relative w-full md:w-32 h-32 bg-muted/20">
                                    <Image
                                        src={sale.listing.images[0]?.imageUrl || "/placeholder.png"}
                                        alt={sale.listing.title}
                                        fill
                                        className="object-cover"
                                    />
                                </div>

                                {/* Content Section */}
                                <div className="flex-1 p-4 md:p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                                    <div className="md:col-span-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-serif font-bold text-lg line-clamp-1">{sale.listing.title}</h4>
                                            <Badge variant="outline" className="h-5 text-[10px] rounded-full uppercase tracking-wider">
                                                ID: {sale.id.slice(0, 8)}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span>Buyer: {sale.buyer.first_name} {sale.buyer.last_name}</span>
                                            <span className="w-1 h-1 rounded-full bg-border" />
                                            <span>{new Date(sale.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-sm font-medium mb-1">Status</div>
                                        <div className="flex items-center gap-2">
                                            {sale.order?.shipping_status === "DELIVERED" ? (
                                                <div className="flex items-center gap-1.5 text-green-600 text-sm font-semibold">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Delivered
                                                </div>
                                            ) : sale.order?.shipping_status === "PROCESSING" ? (
                                                <div className="flex items-center gap-1.5 text-blue-600 text-sm font-semibold">
                                                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                                                    Processing
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-amber-600 text-sm font-black uppercase tracking-widest animate-pulse">
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    Action Required
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between md:justify-end gap-3 relative">
                                        <div className="text-right flex flex-col items-end gap-3">
                                            <div className="text-xl font-bold font-serif">${Number(sale.amount).toLocaleString()}</div>

                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                {sale.order?.label_url && (
                                                    <a
                                                        href={sale.order.label_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-black/90 transition-all scale-100 hover:scale-[1.02]"
                                                    >
                                                        <Printer className="w-3.5 h-3.5" />
                                                        Shipping Label
                                                    </a>
                                                )}

                                                {!sale.order?.label_url && (
                                                    <Button
                                                        size="sm"
                                                        variant="primary"
                                                        className="rounded-xl font-bold shadow-lg shadow-primary/10"
                                                        onClick={() => setSelectedOrderId(sale.order?.id || null)}
                                                    >
                                                        <Package className="w-3.5 h-3.5 mr-2" />
                                                        Generate Label
                                                    </Button>
                                                )}

                                                {sale.order?.tracking_number && (
                                                    <a
                                                        href={sale.order.carrier === "USPS"
                                                            ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${sale.order.tracking_number}`
                                                            : `https://google.com/search?q=${sale.order.carrier}+tracking+${sale.order.tracking_number}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition-all"
                                                    >
                                                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                                                        Track
                                                    </a>
                                                )}
                                            </div>

                                        </div>

                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Seller Rate Selection Overlay */}
            {selectedOrderId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="max-w-xl w-full p-8 shadow-2xl relative animate-in zoom-in-95 duration-300">
                        <button
                            onClick={() => setSelectedOrderId(null)}
                            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <SellerRateSelector
                            orderId={selectedOrderId}
                            onSuccess={() => {
                                setSelectedOrderId(null);
                                window.location.reload(); // Refresh to show new status
                            }}
                        />
                    </Card>
                </div>
            )}
        </div>
    );
}
