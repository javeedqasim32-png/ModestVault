"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { updateUserProfile } from "@/app/actions/auth";
import { AlertCircle, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { normalizeUsPhoneInput } from "@/lib/phone";

export function AddressSettingsForm({ initialData, userId }: { initialData: any, userId: string }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setSuccess(false);

        const formData = new FormData(e.currentTarget);
        const data = {
            first_name: formData.get("first_name") as string,
            last_name: formData.get("last_name") as string,
            phone: formData.get("phone") as string,
            street1: formData.get("street1") as string,
            street2: formData.get("street2") as string,
            city: formData.get("city") as string,
            state: formData.get("state") as string,
            zip: formData.get("zip") as string,
            country: formData.get("country") as string,
        };

        try {
            const res = await updateUserProfile(userId, data);
            if (res.error) {
                setError(res.error);
            } else {
                setSuccess(true);
            }
        } catch (err) {
            setError("Something went wrong.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="space-y-6">
            <Card className="profile-panel p-4 sm:p-6">
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-[var(--bd)] bg-[var(--cr)] text-[var(--br-m)]">
                        <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="font-serif text-[17px] font-semibold text-[var(--tx)]">Shipping Origin</h2>
                        <p className="text-[13px] text-[var(--tx-m)]">This address will be used as the "From" address for your shipping labels.</p>
                    </div>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="first_name" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">First Name</Label>
                            <Input name="first_name" defaultValue={initialData?.first_name} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="last_name" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">Last Name</Label>
                            <Input name="last_name" defaultValue={initialData?.last_name} required />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">Phone Number</Label>
                        <Input
                            name="phone"
                            type="tel"
                            defaultValue={initialData?.phone}
                            required
                            placeholder="(123) 456-7890"
                            onBlur={(e) => {
                                e.currentTarget.value = normalizeUsPhoneInput(e.currentTarget.value);
                            }}
                        />
                    </div>

                    <div className="space-y-3 border-t border-[var(--bd2)] pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="street1" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">Street Address</Label>
                            <Input name="street1" defaultValue={initialData?.street1} required placeholder="123 Luxury Lane" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="street2" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">Apartment, suite, etc. (Optional)</Label>
                            <Input name="street2" defaultValue={initialData?.street2} placeholder="Apt 4B" />
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="city" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">City</Label>
                                <Input name="city" defaultValue={initialData?.city} required placeholder="Beverly Hills" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="state" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">State / Province</Label>
                                <Input name="state" defaultValue={initialData?.state} required placeholder="CA" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="zip" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">ZIP / Postal Code</Label>
                                <Input name="zip" defaultValue={initialData?.zip} required placeholder="90210" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="country" className="text-[12px] font-medium tracking-[0.02em] text-[var(--tx-m)]">Country</Label>
                                <Input name="country" defaultValue={initialData?.country || "US"} required />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-1">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="flex items-center gap-2 p-4 bg-green-50 text-green-700 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-1">
                            <CheckCircle2 className="w-4 h-4" />
                            Profile updated successfully.
                        </div>
                    )}

                    <div className="pt-2">
                        <Button disabled={isSubmitting} type="submit" className="w-full rounded-[12px] border border-[var(--bd)] bg-[var(--wh)] px-5 py-3 text-[14px] font-normal text-[var(--tx)] shadow-none hover:bg-[var(--cr-d)] md:w-auto">
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Saving...
                                </span>
                            ) : (
                                "Save Changes"
                            )}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
