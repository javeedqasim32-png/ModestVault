"use client";

import React, { useState, useEffect } from "react";
import { getSellerLabelSelection, purchaseSelectedShippingLabel } from "@/app/actions/orders";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { Truck, AlertCircle, Loader2, Printer } from "lucide-react";

type SelectedRate = {
    rateId: string | null;
    carrier: string | null;
    serviceLevel: string | null;
    amount: string | null;
    currency: string | null;
    estimatedDays?: number;
};

type SellerLabelSelectionResult = {
    success?: boolean;
    hasLabel?: boolean;
    shippingStage?: string;
    hasBuyerAddress?: boolean;
    hasBuyerSelection?: boolean;
    selection?: SelectedRate | null;
    error?: string;
};

export function SellerRateSelector({
    orderId,
    onSuccess
}: {
    orderId: string;
    onSuccess: () => void;
}) {
    const [selection, setSelection] = useState<SelectedRate | null>(null);
    const [hasBuyerAddress, setHasBuyerAddress] = useState(false);
    const [hasBuyerSelection, setHasBuyerSelection] = useState(false);
    const [loading, setLoading] = useState(true);
    const [purchasing, setPurchasing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchSelection() {
            try {
                const res = await getSellerLabelSelection(orderId) as SellerLabelSelectionResult;
                if (res.error) {
                    setError(res.error);
                } else {
                    setSelection(res.selection || null);
                    setHasBuyerAddress(!!res.hasBuyerAddress);
                    setHasBuyerSelection(!!res.hasBuyerSelection);
                }
            } catch {
                setError("Failed to load shipping selection.");
            } finally {
                setLoading(false);
            }
        }
        fetchSelection();
    }, [orderId]);

    const handlePrintLabel = async () => {
        setPurchasing(true);
        setError(null);
        try {
            const res = await purchaseSelectedShippingLabel(orderId);
            if (res.error) {
                setError(res.error);
            } else {
                onSuccess();
            }
        } catch {
            setError("Failed to purchase label.");
        } finally {
            setPurchasing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm font-medium text-muted-foreground">Loading shipment selection...</p>
            </div>
        );
    }

    if (error) {
        const errorLower = error.toLowerCase();
        const buyerAddressMissing = errorLower.includes("buyer shipping address is missing") || errorLower.includes("no shipping address provided");
        const sellerOriginIssue =
            errorLower.includes("address validation error") ||
            errorLower.includes("from address") ||
            errorLower.includes("address_from") ||
            errorLower.includes("phone field should contain");

        return (
            <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-6 text-center space-y-4">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
                <div className="space-y-1">
                    <h4 className="font-black text-destructive">Shipping Error</h4>
                    <p className="text-sm text-muted-foreground">
                        {buyerAddressMissing
                            ? "Buyer shipping details are not on this order yet. Ask the buyer to open Orders and click Complete shipping details for this purchase."
                            : error}
                    </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                        Try Again
                    </Button>
                    {(sellerOriginIssue || !buyerAddressMissing) && (
                        <Link href="/dashboard/settings" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                            Update Seller Address
                        </Link>
                    )}
                </div>
            </div>
        );
    }

    if (!hasBuyerAddress) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                <h4 className="font-black text-amber-700">Waiting For Buyer Address</h4>
                <p className="text-sm text-amber-800">
                    The buyer has not completed shipping details yet. They must open Orders and complete shipping details first.
                </p>
            </div>
        );
    }

    if (!hasBuyerSelection || !selection) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                <h4 className="font-black text-amber-700">Waiting For Buyer Shipping Choice</h4>
                <p className="text-sm text-amber-800">
                    The buyer has provided address details, but has not selected carrier and delivery speed yet.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h3 className="font-serif font-black text-lg">Buyer Selected Shipping Option</h3>
            <p className="text-sm text-muted-foreground mb-4">
                Confirm and print the label using the buyer&apos;s selected carrier.
            </p>

            <Card className="p-4 border-border/60 bg-card/70">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
                            <Truck className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-black text-sm">{selection.carrier || "Carrier"}</div>
                            <div className="text-xs text-muted-foreground">{selection.serviceLevel || "Selected service"}</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-black text-lg">${parseFloat(selection.amount || "0").toFixed(2)}</div>
                        {selection.estimatedDays && (
                            <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                                ~{selection.estimatedDays} Days
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <Button
                className="w-full rounded-xl font-bold"
                disabled={purchasing}
                onClick={handlePrintLabel}
            >
                {purchasing ? (
                    <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating Label...
                    </span>
                ) : (
                    <span className="flex items-center gap-2">
                        <Printer className="w-4 h-4" />
                        Print Shipping Label
                    </span>
                )}
            </Button>

            {purchasing && (
                <div className="flex items-center justify-center gap-2 pt-1 text-primary animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-black uppercase tracking-widest">Creating label from buyer selection...</span>
                </div>
            )}
        </div>
    );
}
