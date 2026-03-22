"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useForm } from "react-hook-form";
import { completeOrderWithAddress } from "@/app/actions/orders";
import { AlertCircle, Loader2, MapPin } from "lucide-react";
import { hasCarrierPhoneLength, normalizeUsPhoneInput } from "@/lib/phone";

const US_STATE_CODES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export type ShippingAddressFormData = {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone: string;
};

export function ShippingAddressForm({
    orderId,
    initialData,
    onSuccess
}: {
    orderId: string;
    initialData?: ShippingAddressFormData;
    onSuccess?: (data: ShippingAddressFormData) => void;
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { register, handleSubmit, setValue } = useForm<ShippingAddressFormData>({
        defaultValues: initialData
    });

    useEffect(() => {
        if (!initialData) return;
        setValue("name", initialData.name || "");
        setValue("line1", initialData.line1 || "");
        setValue("line2", initialData.line2 || "");
        setValue("city", initialData.city || "");
        setValue("state", initialData.state || "");
        setValue("postal_code", initialData.postal_code || "");
        setValue("country", initialData.country || "US");
        setValue("phone", initialData.phone || "");
    }, [initialData, setValue]);

    const onSubmit = async (data: ShippingAddressFormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const normalizedPayload = {
                ...data,
                phone: normalizeUsPhoneInput(data.phone || "")
            };
            const res = await completeOrderWithAddress(orderId, normalizedPayload);
            if (res.error) {
                setError(res.error);
            } else {
                if (onSuccess) onSuccess(normalizedPayload);
            }
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const phoneRegister = register("phone", {
        required: true,
        validate: (value) => hasCarrierPhoneLength(value) || "Phone must contain between 8 and 15 digits.",
    });

    return (
        <Card className="max-w-md mx-auto p-8 rounded-[2rem] border-primary/20 shadow-xl bg-background/50 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6 font-serif">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <MapPin className="w-5 h-5" />
                </div>
                <div>
                    <h2 className="text-xl font-bold">Shipping Address</h2>
                    <p className="text-sm text-muted-foreground font-sans">Please provide your delivery details.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Full Name</label>
                    <Input {...register("name")} required placeholder="John Doe" autoComplete="shipping name" className="rounded-xl border-border/60" />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Address Line 1</label>
                    <Input {...register("line1")} required placeholder="123 Luxury Lane" autoComplete="shipping address-line1" className="rounded-xl border-border/60" />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Address Line 2 (Optional)</label>
                    <Input {...register("line2")} placeholder="Apt 4B" autoComplete="shipping address-line2" className="rounded-xl border-border/60" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">City</label>
                        <Input {...register("city")} required placeholder="Beverly Hills" autoComplete="shipping address-level2" className="rounded-xl border-border/60" />
                    </div>
                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">State</label>
                        <Input {...register("state")} required placeholder="CA" list="us-state-suggestions" autoComplete="shipping address-level1" className="rounded-xl border-border/60" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Postal Code</label>
                        <Input {...register("postal_code")} required placeholder="90210" autoComplete="shipping postal-code" className="rounded-xl border-border/60" />
                    </div>
                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Country</label>
                        <Input {...register("country")} required placeholder="US" defaultValue="US" list="country-suggestions" autoComplete="shipping country" className="rounded-xl border-border/60" />
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Phone Number</label>
                    <Input
                        {...phoneRegister}
                        required
                        placeholder="(123) 456-7890"
                        autoComplete="shipping tel"
                        className="rounded-xl border-border/60"
                        onBlur={(e) => {
                            phoneRegister.onBlur(e);
                            const normalized = normalizeUsPhoneInput(e.target.value);
                            setValue("phone", normalized, { shouldValidate: true });
                        }}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1 italic">Required for carrier shipping updates.</p>
                </div>

                <datalist id="us-state-suggestions">
                    {US_STATE_CODES.map((stateCode) => (
                        <option key={stateCode} value={stateCode} />
                    ))}
                </datalist>
                <datalist id="country-suggestions">
                    <option value="US" />
                    <option value="CA" />
                    <option value="GB" />
                    <option value="PK" />
                </datalist>

                {error && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-xl text-sm font-medium">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                <Button disabled={isSubmitting} type="submit" className="w-full rounded-xl font-bold py-6 text-lg shadow-lg">
                    {isSubmitting ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Confirming...
                        </span>
                    ) : (
                        "Complete Order"
                    )}
                </Button>
            </form>
        </Card>
    );
}
