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
                <Card className="p-12 text-center border-dashed border-border/60 bg-transparent">
                    <div className="w-16 h-16 bg-white/50 rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground/40 border border-border">
                        <Package className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-serif font-bold mb-2 text-foreground">No sales matching your search</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto mb-6">Try searching for a different item title or buyer name.</p>
                    <Button variant="outline" onClick={() => setSearchTerm("")} className="rounded-full px-8">Clear search</Button>
                </Card>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredSales.map((sale) => (
                        <div key={sale.id} className="group relative flex flex-col overflow-hidden rounded-[1.6rem] border border-border/80 bg-[linear-gradient(180deg,#faf5f2_0%,#f4eae3_100%)] shadow-[0_14px_36px_rgba(110,82,63,0.07)] transition-all hover:scale-[1.01]">
                            {/* Image Section */}
                            <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                                <Image
                                    src={sale.listing.images[0]?.imageUrl || "/placeholder.png"}
                                    alt={sale.listing.title}
                                    fill
                                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                                />
                                
                                {/* Status Overlay - Bottom Right */}
                                <div className="absolute bottom-3 right-3 z-10">
                                    <div className="flex flex-col items-end gap-1.5">
                                        {sale.order?.shipping_status === "DELIVERED" ? (
                                            <div className="flex items-center gap-1.5 bg-green-50/90 backdrop-blur-sm border border-green-200 px-3 py-1.5 rounded-full text-green-700 text-[10px] font-bold shadow-sm">
                                                <CheckCircle2 className="w-3 h-3" />
                                                DELIVERED
                                            </div>
                                        ) : sale.order?.shipping_status === "SHIPPED" ? (
                                            <div className="flex items-center gap-1.5 bg-blue-50/90 backdrop-blur-sm border border-blue-200 px-3 py-1.5 rounded-full text-blue-700 text-[10px] font-bold shadow-sm">
                                                <Package className="w-3 h-3" />
                                                SHIPPED
                                            </div>
                                        ) : sale.order?.shipping_status === "PROCESSING" ? (
                                            <div className="flex items-center gap-1.5 bg-amber-50/90 backdrop-blur-sm border border-amber-200 px-3 py-1.5 rounded-full text-amber-700 text-[10px] font-bold shadow-sm">
                                                <Clock className="w-3 h-3 animate-pulse" />
                                                PROCESSING
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-border px-3 py-1.5 rounded-full text-foreground/70 text-[10px] font-bold shadow-sm">
                                                <AlertCircle className="w-3 h-3 text-red-400" />
                                                ACTION REQ
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Content Section */}
                            <div className="flex flex-1 flex-col p-4">
                                <div className="mb-3">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">ID: {sale.id.slice(0, 8)}</p>
                                        <span className="text-[14px] font-bold text-foreground font-serif">${Number(sale.amount).toLocaleString()}</span>
                                    </div>
                                    <h4 className="font-serif font-bold text-lg leading-tight line-clamp-1 text-foreground mb-1">{sale.listing.title}</h4>
                                    <div className="text-[12px] text-muted-foreground flex flex-col gap-0.5 mt-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary/30" />
                                            <span>{sale.buyer.first_name} {sale.buyer.last_name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-border" />
                                            <span>{new Date(sale.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto pt-3 border-t border-border/40 flex flex-col gap-2">
                                    {sale.order?.label_url && (
                                        <a
                                            href={sale.order.label_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-[11px] font-bold text-white shadow-lg shadow-black/10 hover:bg-black/90 transition-all hover:scale-[1.02]"
                                        >
                                            <Printer className="w-3.5 h-3.5" />
                                            PRINT LABEL
                                        </a>
                                    )}

                                    {!sale.order?.label_url && (
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            className="w-full rounded-xl py-2.5 text-[11px] font-bold shadow-lg shadow-primary/10"
                                            onClick={() => setSelectedOrderId(sale.order?.id || null)}
                                        >
                                            <Package className="w-3.5 h-3.5 mr-2" />
                                            GENERATE LABEL
                                        </Button>
                                    )}

                                    {sale.order?.tracking_number && (
                                        <a
                                            href={sale.order.carrier === "USPS"
                                                ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${sale.order.tracking_number}`
                                                : `https://google.com/search?q=${encodeURIComponent(`${sale.order.carrier || 'carrier'} tracking ${sale.order.tracking_number}`)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-[11px] font-bold text-foreground/80 hover:bg-muted transition-all"
                                        >
                                            <Search className="w-3.5 h-3.5 text-muted-foreground" />
                                            TRACK
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
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
