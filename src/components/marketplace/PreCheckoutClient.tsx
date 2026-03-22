"use client";

import { useMemo, useState } from "react";
import { createCheckoutSessionWithShipping, getShippingRatesForListing } from "@/app/actions/checkout";
import { ShippingAddressFormData } from "./ShippingAddressForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { AlertCircle, ChevronRight, Loader2, Truck } from "lucide-react";
import { hasCarrierPhoneLength, normalizeUsPhoneInput } from "@/lib/phone";

const US_STATE_CODES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

type Rate = {
    id: string;
    carrier: string;
    serviceLevel: string;
    amount: string;
    currency: string;
    estimatedDays?: number;
};

type ListingRatesResponse = {
    success?: boolean;
    shipmentId?: string;
    rates?: Rate[];
    error?: string;
};

type CheckoutResponse = {
    success?: boolean;
    url?: string;
    error?: string;
};

export function PreCheckoutClient({
    listingId,
    listingTitle,
    listingPrice
}: {
    listingId: string;
    listingTitle: string;
    listingPrice: number;
}) {
    const [step, setStep] = useState<"ADDRESS" | "RATES">("ADDRESS");
    const [address, setAddress] = useState<ShippingAddressFormData>({
        name: "",
        line1: "",
        line2: "",
        city: "",
        state: "",
        postal_code: "",
        country: "US",
        phone: "",
    });
    const [rates, setRates] = useState<Rate[]>([]);
    const [shipmentId, setShipmentId] = useState<string | null>(null);
    const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
    const [loadingRates, setLoadingRates] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedRate = useMemo(() => rates.find((r) => r.id === selectedRateId) || null, [rates, selectedRateId]);
    const shippingCost = Number(selectedRate?.amount || 0);
    const total = Number(listingPrice) + (Number.isFinite(shippingCost) ? shippingCost : 0);

    const fetchRates = async () => {
        setLoadingRates(true);
        setError(null);
        try {
            const normalizedAddress = {
                ...address,
                phone: normalizeUsPhoneInput(address.phone),
            };
            setAddress(normalizedAddress);
            const res = await getShippingRatesForListing(listingId, normalizedAddress) as ListingRatesResponse;
            if (res.error) {
                setError(res.error);
                return;
            }
            setRates(res.rates || []);
            setShipmentId(res.shipmentId || null);
            setStep("RATES");
        } catch {
            setError("Failed to fetch shipping rates.");
        } finally {
            setLoadingRates(false);
        }
    };

    const continueToPayment = async () => {
        if (!selectedRate) return;

        setSubmitting(true);
        setError(null);
        try {
            const normalizedAddress = {
                ...address,
                phone: normalizeUsPhoneInput(address.phone),
            };
            setAddress(normalizedAddress);
            const res = await createCheckoutSessionWithShipping(
                listingId,
                normalizedAddress,
                {
                    rateId: selectedRate.id,
                    carrier: selectedRate.carrier,
                    serviceLevel: selectedRate.serviceLevel,
                    amount: selectedRate.amount,
                    currency: selectedRate.currency,
                    estimatedDays: selectedRate.estimatedDays,
                    shipmentId: shipmentId || undefined
                }
            ) as CheckoutResponse;

            if (res.error) {
                setError(res.error);
                return;
            }
            if (res.url) {
                window.location.href = res.url;
            }
        } catch {
            setError("Failed to continue to payment.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-2xl space-y-8">
            <div className="rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,#faf5f1_0%,#f1e7e0_100%)] p-6 sm:p-8">
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Checkout</p>
                <h1 className="mt-2 font-serif text-3xl font-bold text-foreground">Shipping & Payment</h1>
                <p className="mt-2 text-muted-foreground">
                    Enter shipping details and pick delivery speed before payment.
                </p>
            </div>

            {step === "ADDRESS" ? (
                <Card className="p-6 sm:p-8 space-y-4 rounded-[1.5rem]">
                    <h2 className="font-serif text-2xl text-foreground">Shipping Address</h2>
                    <div className="grid gap-4">
                        <Input value={address.name} onChange={(e) => setAddress((p) => ({ ...p, name: e.target.value }))} placeholder="Full Name" autoComplete="shipping name" />
                        <Input value={address.line1} onChange={(e) => setAddress((p) => ({ ...p, line1: e.target.value }))} placeholder="Address Line 1" autoComplete="shipping address-line1" />
                        <Input value={address.line2 || ""} onChange={(e) => setAddress((p) => ({ ...p, line2: e.target.value }))} placeholder="Address Line 2 (Optional)" autoComplete="shipping address-line2" />
                        <div className="grid grid-cols-2 gap-3">
                            <Input value={address.city} onChange={(e) => setAddress((p) => ({ ...p, city: e.target.value }))} placeholder="City" autoComplete="shipping address-level2" />
                            <Input value={address.state} onChange={(e) => setAddress((p) => ({ ...p, state: e.target.value }))} placeholder="State" list="checkout-us-state-suggestions" autoComplete="shipping address-level1" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Input value={address.postal_code} onChange={(e) => setAddress((p) => ({ ...p, postal_code: e.target.value }))} placeholder="Postal Code" autoComplete="shipping postal-code" />
                            <Input value={address.country} onChange={(e) => setAddress((p) => ({ ...p, country: e.target.value }))} placeholder="Country" list="checkout-country-suggestions" autoComplete="shipping country" />
                        </div>
                        <Input
                            value={address.phone}
                            onChange={(e) => setAddress((p) => ({ ...p, phone: e.target.value }))}
                            onBlur={(e) => setAddress((p) => ({ ...p, phone: normalizeUsPhoneInput(e.target.value) }))}
                            placeholder="Phone Number"
                            autoComplete="shipping tel"
                        />
                        <p className="text-xs text-muted-foreground">
                            Tip: US numbers are normalized automatically (example: `8172627618` becomes `18172627618`).
                        </p>
                    </div>

                    <datalist id="checkout-us-state-suggestions">
                        {US_STATE_CODES.map((stateCode) => (
                            <option key={stateCode} value={stateCode} />
                        ))}
                    </datalist>
                    <datalist id="checkout-country-suggestions">
                        <option value="US" />
                        <option value="CA" />
                        <option value="GB" />
                        <option value="PK" />
                    </datalist>

                    {error ? (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-xl text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    ) : null}

                    <Button disabled={loadingRates || !address.name || !address.line1 || !address.city || !address.state || !address.postal_code || !address.country || !address.phone || !hasCarrierPhoneLength(address.phone)} onClick={fetchRates} className="w-full rounded-xl font-bold py-6">
                        {loadingRates ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Getting Rates...
                            </span>
                        ) : (
                            <>
                                Continue to Shipping Options
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </Card>
            ) : (
                <div className="space-y-4">
                    <Card className="p-6 rounded-[1.5rem]">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Item</p>
                                <p className="font-serif text-xl">{listingTitle}</p>
                            </div>
                            <p className="font-black text-xl">${listingPrice.toFixed(2)}</p>
                        </div>
                    </Card>

                    <div className="grid gap-3">
                        {rates.map((rate) => (
                            <button
                                key={rate.id}
                                onClick={() => setSelectedRateId(rate.id)}
                                className={`w-full text-left ${selectedRateId === rate.id ? "scale-[1.01]" : ""}`}
                            >
                                <Card className={`p-4 border-2 ${selectedRateId === rate.id ? "border-primary bg-primary/5" : "border-border/60"}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Truck className="w-5 h-5 text-primary" />
                                            <div>
                                                <p className="font-bold">{rate.carrier}</p>
                                                <p className="text-xs text-muted-foreground">{rate.serviceLevel}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black">${Number(rate.amount).toFixed(2)}</p>
                                            {rate.estimatedDays ? <p className="text-xs text-muted-foreground">~{rate.estimatedDays} days</p> : null}
                                        </div>
                                    </div>
                                </Card>
                            </button>
                        ))}
                    </div>

                    <Card className="p-5 rounded-[1.5rem]">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Item subtotal</span>
                            <span>${listingPrice.toFixed(2)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Shipping</span>
                            <span>${shippingCost.toFixed(2)}</span>
                        </div>
                        <div className="mt-3 border-t border-border/60 pt-3 flex items-center justify-between font-black">
                            <span>Total</span>
                            <span>${total.toFixed(2)}</span>
                        </div>
                    </Card>

                    {error ? (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-xl text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    ) : null}

                    <div className="flex items-center gap-3">
                        <Button variant="ghost" onClick={() => setStep("ADDRESS")} className="rounded-xl px-6">
                            Edit Address
                        </Button>
                        <Button disabled={!selectedRateId || submitting} onClick={continueToPayment} className="flex-1 rounded-xl font-bold py-6">
                            {submitting ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Redirecting to Payment...
                                </span>
                            ) : (
                                "Continue to Payment"
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
