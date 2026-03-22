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
            <Card className="p-8 border-border/60 shadow-sm bg-card">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                        <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold font-serif">Shipping Origin</h2>
                        <p className="text-sm text-muted-foreground">This address will be used as the "From" address for your shipping labels.</p>
                    </div>
                </div>

                <form onSubmit={onSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="first_name">First Name</Label>
                            <Input name="first_name" defaultValue={initialData?.first_name} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="last_name">Last Name</Label>
                            <Input name="last_name" defaultValue={initialData?.last_name} required />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
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

                    <div className="space-y-4 pt-4 border-t border-border/50">
                        <div className="space-y-2">
                            <Label htmlFor="street1">Street Address</Label>
                            <Input name="street1" defaultValue={initialData?.street1} required placeholder="123 Luxury Lane" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="street2">Apartment, suite, etc. (Optional)</Label>
                            <Input name="street2" defaultValue={initialData?.street2} placeholder="Apt 4B" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="city">City</Label>
                                <Input name="city" defaultValue={initialData?.city} required placeholder="Beverly Hills" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="state">State / Province</Label>
                                <Input name="state" defaultValue={initialData?.state} required placeholder="CA" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="zip">ZIP / Postal Code</Label>
                                <Input name="zip" defaultValue={initialData?.zip} required placeholder="90210" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="country">Country</Label>
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

                    <div className="pt-4">
                        <Button disabled={isSubmitting} type="submit" className="w-full md:w-auto px-12 py-6 rounded-xl font-bold shadow-lg">
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
