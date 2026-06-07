"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
    createBundledCheckoutSessionWithShipping,
    createCheckoutSessionWithShipping,
    getShippingRatesForBundle,
    getShippingRatesForListing,
} from "@/app/actions/checkout";
import { ShippingAddressFormData } from "./ShippingAddressForm";
import { Input } from "@/components/ui/Input";
import { AlertCircle, ChevronRight, Loader2, Lock, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
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
    /** Carrier-provided range, e.g. "Delivery within 1 to 3 business days." */
    durationTerms?: string;
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

type BundleItem = { id: string; title: string; price: number; imageUrl?: string };

// Short, scannable delivery copy keyed off the service-level name. We
// deliberately ignore Shippo's `durationTerms` field because the carrier strings
// are verbose ("Delivery within 1, 2, or 3 days based on where your package
// started and where it's being sent"). Buyers want a glance-able range.
function describeRate(rate: Rate): string {
    const sl = (rate.serviceLevel || "")
        .toLowerCase()
        .replace(/®/g, "")
        .replace(/^ups\s*/, "")
        .trim();

    const ranges: Record<string, string> = {
        // USPS
        "ground advantage": "2 to 5 days",
        "priority mail": "1 to 3 days",
        "priority mail express": "1 to 2 days",
        "media mail": "2 to 8 days",
        // UPS
        "ground": "1 to 5 days",
        "ground saver": "2 to 7 days",
        "3 day select": "3 days",
        "2nd day air": "2 days",
        "2nd day air a.m.": "2 days",
        "next day air": "1 day",
        "next day air saver": "1 day",
        "next day air early a.m.": "1 day",
    };

    if (ranges[sl]) return `Delivery in ${ranges[sl]}`;
    if (rate.estimatedDays) {
        return `Delivery in ~${rate.estimatedDays} day${rate.estimatedDays === 1 ? "" : "s"}`;
    }
    return rate.serviceLevel;
}

export function PreCheckoutClient({
    listingId,
    listingTitle,
    listingPrice,
    listingImageUrl,
    initialAddress,
    bundleItems,
    headingClassName,
}: {
    listingId: string;
    listingTitle: string;
    listingPrice: number;
    listingImageUrl?: string;
    initialAddress?: ShippingAddressFormData;
    /**
     * When set (length >= 2), the component runs in BUNDLE mode: one address
     * + one rate selection drives a multi-item Stripe session with consolidated
     * shipping. Single-item callers omit this prop and the existing flow runs
     * unchanged. The single `listingId` / `listingTitle` / `listingPrice` props
     * are still required for backwards compatibility with the single-item
     * cancel URL pattern, but in bundle mode the summary lists every item.
     */
    bundleItems?: BundleItem[];
    /** Cormorant font className passed from the server page (next/font/local). */
    headingClassName?: string;
}) {
    const serifHeading = headingClassName ?? "";
    const isBundle = !!bundleItems && bundleItems.length >= 2;
    const items: BundleItem[] = isBundle
        ? bundleItems!
        : [{ id: listingId, title: listingTitle, price: listingPrice, imageUrl: listingImageUrl }];
    const itemsSubtotal = items.reduce((sum, item) => sum + item.price, 0);
    const [step, setStep] = useState<"ADDRESS" | "RATES">("ADDRESS");
    const [address, setAddress] = useState<ShippingAddressFormData>(initialAddress || {
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
    const total = itemsSubtotal + (Number.isFinite(shippingCost) ? shippingCost : 0);

    const fetchRates = async () => {
        setLoadingRates(true);
        setError(null);
        try {
            const normalizedAddress = {
                ...address,
                phone: normalizeUsPhoneInput(address.phone),
            };
            setAddress(normalizedAddress);
            const res = (isBundle
                ? await getShippingRatesForBundle(items.map((i) => i.id), normalizedAddress)
                : await getShippingRatesForListing(listingId, normalizedAddress)) as ListingRatesResponse;
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
            const rateInput = {
                rateId: selectedRate.id,
                carrier: selectedRate.carrier,
                serviceLevel: selectedRate.serviceLevel,
                amount: selectedRate.amount,
                currency: selectedRate.currency,
                estimatedDays: selectedRate.estimatedDays,
                shipmentId: shipmentId || undefined,
            };
            const res = (isBundle
                ? await createBundledCheckoutSessionWithShipping(items.map((i) => i.id), normalizedAddress, rateInput)
                : await createCheckoutSessionWithShipping(listingId, normalizedAddress, rateInput)) as CheckoutResponse;

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
        <div className="w-full space-y-4">
            <div className="rounded-[1.65rem] border border-[#ddd3cb] bg-[#fbf8f5] px-5 py-5 sm:px-7 sm:py-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#9a6f3f]">Checkout</p>
                <h1 className={`${serifHeading} mt-2 text-[32px] font-semibold leading-[1.05] text-[#3a2a20] sm:text-[36px]`}>
                    Shipping & Payment
                </h1>
                <p className="mt-2 max-w-[28rem] text-[0.95rem] leading-[1.35] text-[#8a7667]">
                    Enter shipping details and pick delivery speed before payment.
                </p>
            </div>

            {step === "ADDRESS" ? (
                <div className="rounded-[1.45rem] border border-[#ddd3cb] bg-[#fbf8f5] p-5 sm:p-6 space-y-4">
                    <h2 className={`${serifHeading} text-[20px] font-semibold text-[#3a2a20]`}>Shipping Address</h2>
                    <div className="grid gap-3">
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
                        <p className="text-[0.78rem] text-[#8a7667]">
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
                        <div className="flex items-center gap-2 rounded-[1rem] border border-[#e6c5bd] bg-[#fbeae5] px-3 py-2.5 text-sm text-[#8c3a28]">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    ) : null}

                    <button
                        type="button"
                        disabled={loadingRates || !address.name || !address.line1 || !address.city || !address.state || !address.postal_code || !address.country || !address.phone || !hasCarrierPhoneLength(address.phone)}
                        onClick={fetchRates}
                        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#5f4437] py-3.5 text-[0.95rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#4a3328] disabled:cursor-not-allowed disabled:bg-[#5f4437]/40"
                    >
                        {loadingRates ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Getting Rates...
                            </>
                        ) : (
                            <>
                                Continue to Shipping Options
                                <ChevronRight className="h-4 w-4" />
                            </>
                        )}
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Order Summary */}
                    <div className="rounded-[1.45rem] border border-[#ddd3cb] bg-[#fbf8f5] p-5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#efe6dd] text-[#6f5647]">
                                <ShoppingBag className="h-4 w-4" />
                            </div>
                            <div>
                                <p className={`${serifHeading} text-[1.05rem] font-semibold text-[#3a2a20]`}>Order Summary</p>
                                <p className="text-[0.78rem] text-[#8a7667]">
                                    {isBundle
                                        ? `${items.length} items from the same seller — one package, one shipping fee`
                                        : "1 item"}
                                </p>
                            </div>
                        </div>

                        <ul className="mt-4 divide-y divide-[#e9ddd2]">
                            {items.map((item) => (
                                <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                    <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-[0.75rem] bg-[#f2ebe4]">
                                        {item.imageUrl ? (
                                            <Image src={item.imageUrl} alt={item.title} fill className="object-cover object-top" sizes="64px" />
                                        ) : null}
                                    </div>
                                    <span className={`${serifHeading} min-w-0 flex-1 truncate text-[1rem] text-[#3a2a20]`}>{item.title}</span>
                                    <span className="shrink-0 text-[0.95rem] font-semibold text-[#3a2a20]">${item.price.toFixed(2)}</span>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-3 flex items-center justify-between border-t border-[#e9ddd2] pt-3">
                            <span className="text-[0.95rem] font-semibold text-[#3a2a20]">Order Total</span>
                            <span className="text-[1.05rem] font-semibold text-[#9a6f3f]">${itemsSubtotal.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Shipping section */}
                    <div className="pt-1">
                        <div className="flex items-center gap-2 px-1">
                            <Truck className="h-4 w-4 text-[#9a6f3f]" />
                            <p className={`${serifHeading} text-[1.05rem] font-semibold text-[#3a2a20]`}>Choose your shipping method</p>
                        </div>

                        <div className="mt-3 flex flex-col gap-2.5">
                            {rates.map((rate) => {
                                const isSelected = selectedRateId === rate.id;
                                return (
                                    <button
                                        key={rate.id}
                                        type="button"
                                        onClick={() => setSelectedRateId(rate.id)}
                                        className={`w-full rounded-[1.25rem] border p-4 text-left transition-colors ${
                                            isSelected
                                                ? "border-[#9a6f3f] bg-[#f6e7d4]/55"
                                                : "border-[#ddd3cb] bg-[#fbf8f5] hover:bg-[#f2ebe4]/40"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span
                                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                                    isSelected ? "border-[#9a6f3f]" : "border-[#c8bcb1]"
                                                }`}
                                            >
                                                <span className={`h-2.5 w-2.5 rounded-full ${isSelected ? "bg-[#9a6f3f]" : "bg-transparent"}`} />
                                            </span>
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#efe6dd] text-[#6f5647]">
                                                <Truck className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className={`${serifHeading} truncate text-[1rem] font-semibold text-[#3a2a20]`}>
                                                    {rate.carrier} {rate.serviceLevel}
                                                </p>
                                                <p className="text-[0.78rem] leading-[1.3] text-[#8a7667]">
                                                    {describeRate(rate)}
                                                </p>
                                            </div>
                                            <div className="shrink-0">
                                                <p className="text-[1rem] font-semibold text-[#3a2a20]">${Number(rate.amount).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {error ? (
                        <div className="flex items-center gap-2 rounded-[1rem] border border-[#e6c5bd] bg-[#fbeae5] px-3 py-2.5 text-sm text-[#8c3a28]">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    ) : null}

                    {/* Action row — Continue first, Edit Address second. Stacks
                        vertically on mobile so neither button can push the row past
                        the viewport. */}
                    <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:items-center">
                        <button
                            type="button"
                            disabled={!selectedRateId || submitting}
                            onClick={continueToPayment}
                            className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-full bg-[#5f4437] px-4 py-3.5 text-[0.95rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#4a3328] disabled:cursor-not-allowed disabled:bg-[#5f4437]/40 sm:flex-1"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Redirecting to Payment...
                                </>
                            ) : selectedRateId ? (
                                <>Continue to Payment · ${total.toFixed(2)}</>
                            ) : (
                                "Select a shipping method"
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep("ADDRESS")}
                            className="inline-flex w-full shrink-0 items-center justify-center rounded-full border border-[#d7cdc4] bg-white px-5 py-3 text-[0.88rem] font-medium text-[#5f4a3c] hover:bg-[#f2ebe4] sm:w-auto"
                        >
                            Edit Address
                        </button>
                    </div>

                    {/* Trust card */}
                    <div className="flex items-center gap-3 rounded-[1.45rem] border border-[#ddd3cb] bg-[#fbf8f5] p-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#9a6f3f] text-white">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[0.95rem] font-semibold text-[#3a2a20]">Secure & Trusted Checkout</p>
                            <p className="text-[0.78rem] text-[#8a7667]">Your information is encrypted and safe with us.</p>
                        </div>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#6f5647] shadow-sm">
                            <Lock className="h-4 w-4" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
