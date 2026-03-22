"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getShippingRatesForOrder, selectShippingRate } from "@/app/actions/orders";
import { ShippingAddressForm, ShippingAddressFormData } from "./ShippingAddressForm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "../ui/Skeleton";
import { Truck, CheckCircle2, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

type Rate = {
    id: string;
    carrier: string;
    serviceLevel: string;
    amount: string;
    currency: string;
    estimatedDays?: number;
};

type ShippingRatesResult = {
    error?: string;
    shipmentId?: string;
    rates?: Rate[];
};

type Step = "ADDRESS" | "RATES" | "SUCCESS";

export function BuySuccessClient({
    orderId,
    initialAddress,
    initialRates,
    forceAddressStep = false,
}: {
    orderId: string;
    initialAddress?: ShippingAddressFormData;
    initialRates?: Rate[];
    forceAddressStep?: boolean;
}) {
    const [step, setStep] = useState<Step>(
        forceAddressStep ? "ADDRESS" : (initialRates ? "RATES" : (initialAddress ? "RATES" : "ADDRESS"))
    );
    const [address, setAddress] = useState<ShippingAddressFormData | undefined>(initialAddress);
    const [rates, setRates] = useState<Rate[]>(initialRates || []);
    const [shipmentId, setShipmentId] = useState<string | null>(null);
    const [loadingRates, setLoadingRates] = useState(false);
    const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchRates = useCallback(async (addr: ShippingAddressFormData) => {
        setLoadingRates(true);
        setError(null);
        try {
            const res = await getShippingRatesForOrder(orderId, addr) as ShippingRatesResult;
            if (res.error) {
                setError(res.error);
                setStep("ADDRESS");
            } else {
                setRates(res.rates || []);
                setShipmentId(res.shipmentId || null);
                setStep("RATES");
            }
        } catch {
            setError("Failed to fetch shipping rates. Please check your address.");
            setStep("ADDRESS");
        } finally {
            setLoadingRates(false);
        }
    }, [orderId]);

    // If we have an initial address but no rates (e.g. from Stripe), fetch them immediately
    useEffect(() => {
        if (!forceAddressStep && initialAddress && !initialRates && step === "RATES") {
            fetchRates(initialAddress);
        }
    }, [fetchRates, forceAddressStep, initialAddress, initialRates, step]);

    const handleAddressSuccess = (addr: ShippingAddressFormData) => {
        setAddress(addr);
        fetchRates(addr);
    };

    const handleRateSelect = async () => {
        if (!selectedRateId) return;
        const selectedRate = rates.find(r => r.id === selectedRateId);
        if (!selectedRate) return;

        setIsPurchasing(true);
        setError(null);
        try {
            const res = await selectShippingRate(
                orderId,
                selectedRateId,
                selectedRate.carrier,
                shipmentId || undefined,
                {
                    serviceLevel: selectedRate.serviceLevel,
                    amount: selectedRate.amount,
                    currency: selectedRate.currency,
                    estimatedDays: selectedRate.estimatedDays
                }
            );
            if (res.error) {
                setError(res.error);
            } else {
                setStep("SUCCESS");
                // Optional: window.location.reload() or let the UI handle success
            }
        } catch {
            setError("Failed to purchase shipping label.");
        } finally {
            setIsPurchasing(false);
        }
    };

    if (step === "ADDRESS") {
        return <ShippingAddressForm orderId={orderId} initialData={address} onSuccess={handleAddressSuccess} />;
    }

    if (step === "RATES") {
        return (
            <div className="max-w-2xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-center space-y-4">
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-black uppercase text-[10px] tracking-widest px-6 py-1.5 rounded-full">
                        Step 2 of 2
                    </Badge>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-foreground">
                        Choose <span className="text-muted-foreground">Delivery</span>
                    </h1>
                    <p className="text-muted-foreground font-medium text-lg max-w-sm mx-auto">
                        Select your preferred carrier and delivery speed for the seller to print your label.
                    </p>
                </div>

                <div className="grid gap-4">
                    {loadingRates ? (
                        Array(3).fill(0).map((_, i) => (
                            <Card key={i} className="p-6 rounded-[1.5rem] border-border/60">
                                <div className="flex items-center gap-4">
                                    <Skeleton className="w-12 h-12 rounded-xl" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-1/4" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                    <Skeleton className="h-6 w-16" />
                                </div>
                            </Card>
                        ))
                    ) : (
                        rates.map((rate) => (
                            <button
                                key={rate.id}
                                onClick={() => setSelectedRateId(rate.id)}
                                className={`w-full text-left transition-all duration-300 ${selectedRateId === rate.id ? "scale-[1.02]" : "hover:scale-[1.01]"}`}
                            >
                                <Card className={`p-6 rounded-[1.5rem] border-2 transition-all ${selectedRateId === rate.id ? "border-primary bg-primary/5 shadow-lg" : "border-border/60 bg-card/50 hover:border-primary/40"}`}>
                                    <div className="flex items-center gap-5">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${selectedRateId === rate.id ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                                            <Truck className="w-7 h-7" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-lg text-foreground">{rate.carrier}</span>
                                                <Badge variant="outline" className="text-[10px] font-black uppercase tracking-wider">{rate.serviceLevel}</Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                {rate.estimatedDays ? `Estimated delivery: ${rate.estimatedDays} days` : "Standard delivery"}
                                            </p>
                                        </div>
                                        <div className="text-2xl font-black text-foreground">
                                            ${Number(rate.amount).toFixed(2)}
                                        </div>
                                    </div>
                                </Card>
                            </button>
                        ))
                    )}
                </div>

                {error && (
                    <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-2xl text-sm font-bold border border-destructive/20">
                        <AlertCircle className="w-5 h-5" />
                        {error}
                        <Button variant="ghost" size="sm" onClick={() => setStep("ADDRESS")} className="ml-auto font-black text-xs uppercase tracking-widest">Edit Address</Button>
                    </div>
                )}

                <div className="flex items-center justify-between pt-4">
                    <Button variant="ghost" onClick={() => setStep("ADDRESS")} className="rounded-full font-bold px-8">
                        Back to Address
                    </Button>
                    <Button
                        disabled={!selectedRateId || isPurchasing}
                        onClick={handleRateSelect}
                        className="rounded-full font-black px-12 py-7 text-lg shadow-2xl shadow-primary/20 group"
                    >
                        {isPurchasing ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing...
                            </span>
                        ) : (
                            <>
                                Save Shipping Option
                                <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    if (step === "SUCCESS") {
        return (
            <div className="max-w-2xl mx-auto w-full text-center space-y-12 animate-in fade-in zoom-in-95 duration-1000">
                <div className="relative group">
                    <div className="w-28 h-28 bg-primary/10 rounded-[3rem] flex items-center justify-center mx-auto mb-8 border-4 border-white shadow-2xl ring-1 ring-primary/20 transform group-hover:scale-110 transition-transform duration-700">
                        <CheckCircle2 className="w-14 h-14 text-primary" />
                    </div>
                </div>

                <div className="space-y-4">
                    <Badge variant="success" className="bg-primary/10 text-primary border-none font-black uppercase text-[10px] tracking-widest px-6 py-1.5 rounded-full shadow-sm">
                        Secured Successfully
                    </Badge>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-foreground">
                        Shipping Choice <span className="text-muted-foreground">Saved</span>
                    </h1>
                    <p className="text-xl text-muted-foreground font-medium max-w-lg mx-auto leading-relaxed">
                        The seller can now generate your shipping label using your selected carrier and speed.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-md mx-auto">
                    <Link href="/dashboard/purchases" className="w-full">
                        <Button variant="primary" size="lg" className="w-full rounded-[2rem] font-black group shadow-2xl shadow-primary/20">
                            Order History
                        </Button>
                    </Link>

                    <Link href="/" className="w-full">
                        <Button variant="secondary" size="lg" className="w-full rounded-[2rem] font-bold border border-border shadow-sm">
                            Back to Home
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return null;
}
