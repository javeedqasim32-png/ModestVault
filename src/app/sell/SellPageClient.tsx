"use client";

import { useState } from "react";
import { createListing } from "../actions/listings";
import { onboardSellerAction } from "../actions/stripe";
import { Tag, UploadCloud, ChevronRight, CheckCircle2, CreditCard, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export default function SellPageClient({ isSellerInitially }: { isSellerInitially: boolean }) {
    const [isSeller, setIsSeller] = useState(isSellerInitially);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    async function handleStripeOnboarding() {
        setLoading(true);
        setError("");
        try {
            const res = await onboardSellerAction();
            if (res?.url) {
                window.location.href = res.url;
            } else {
                setError("Failed to generate onboarding link.");
            }
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred during onboarding.");
        } finally {
            setLoading(false);
        }
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setError(""); // Clear previous errors

        if (file) {
            // Check if file size is > 10MB (10 * 1024 * 1024 bytes)
            if (file.size > 10 * 1024 * 1024) {
                setError("Image is too large. Please select an image smaller than 10MB.");
                setPreviewUrl(null);
                e.target.value = ""; // Reset input
                return;
            }

            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }
    };

    if (!isSeller) {
        return (
            <div className="container mx-auto px-6 lg:px-10 py-24 flex justify-center min-h-[calc(100vh-140px)]">
                <div className="max-w-2xl w-full text-center space-y-12">
                    <div className="space-y-4">
                        <h1 className="font-serif text-4xl md:text-6xl font-bold text-foreground">
                            Become a Seller
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
                            Join our community of fashion sellers. Turn your wardrobe into a boutique with secure payouts.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                        {[
                            { title: "Global Reach", desc: "Connect with buyers looking for modest fashion worldwide.", icon: Tag },
                            { title: "Secure Payouts", desc: "Fast, encrypted transfers via Stripe directly to your bank.", icon: CreditCard },
                            { title: "Full Control", desc: "Manage buying and selling from one dashboard.", icon: CheckCircle2 },
                        ].map((item) => (
                            <div key={item.title} className="border border-border p-6">
                                <item.icon className="w-6 h-6 text-foreground mb-4" />
                                <h3 className="font-medium text-foreground mb-2">{item.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-700 text-sm p-4 border border-red-200 text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <Button
                            onClick={handleStripeOnboarding}
                            isLoading={loading}
                            size="lg"
                            className="px-12"
                        >
                            Connect with Stripe
                            <ChevronRight className="ml-2 w-5 h-5" />
                        </Button>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-widest">
                            Secure Onboarding Powered by Stripe
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-6 lg:px-10 py-16 max-w-3xl">
            <div className="mb-12">
                <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                    Create Listing
                </h1>
                <p className="text-muted-foreground">
                    Present your fashion pieces in their best light.
                </p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 text-sm p-4 border border-red-200 mb-8">
                    {error}
                </div>
            )}

            <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                setError("");
                try {
                    const formData = new FormData(e.currentTarget);
                    const res = await createListing(formData);
                    if (res?.error) {
                        setError(res.error);
                    }
                } catch (err) {
                    setError("An unexpected error occurred.");
                } finally {
                    setLoading(false);
                }
            }} className="space-y-12">

                {/* Image Upload */}
                <section className="space-y-4">
                    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Product Photo
                    </h2>

                    <div className="group relative aspect-[4/3] w-full cursor-pointer overflow-hidden border border-dashed border-border transition-all hover:border-primary bg-muted/20">
                        {previewUrl ? (
                            <div className="relative w-full h-full">
                                <Image
                                    src={previewUrl}
                                    alt="Preview"
                                    fill
                                    className="object-cover"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                    <div className="text-white text-center">
                                        <UploadCloud className="w-8 h-8 mx-auto mb-2" />
                                        <p className="text-sm font-medium">Replace Photo</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                                <UploadCloud className="w-10 h-10 text-muted-foreground mb-4" />
                                <h3 className="text-sm font-medium text-foreground mb-1">Upload photo</h3>
                                <p className="text-xs text-muted-foreground">
                                    Drag and drop or <span className="text-foreground underline">browse</span>
                                </p>
                            </div>
                        )}
                        <input
                            type="file"
                            name="image"
                            accept="image/*"
                            required
                            onChange={handleImageChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
                        />
                    </div>
                </section>

                {/* Item Details */}
                <section className="space-y-6">
                    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Item Details
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" name="title" required placeholder="e.g., Silk Floral Abaya" className="h-12" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            <select
                                id="category"
                                name="category"
                                required
                                className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                            >
                                <option value="">Select Category</option>
                                {["Dresses", "Tops", "Outerwear", "Bottoms", "Activewear", "Accessories"].map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="price">Price ($)</Label>
                            <Input id="price" name="price" type="number" step="0.01" min="0.50" required placeholder="0.00" className="h-12" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="brand">Brand</Label>
                            <Input id="brand" name="brand" placeholder="e.g., Luxury Modest" className="h-12" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <textarea
                            id="description"
                            name="description"
                            required
                            rows={5}
                            placeholder="Describe the texture, fit, and details of this piece..."
                            className="w-full border border-border bg-background p-4 text-sm focus:border-primary focus:outline-none transition-colors resize-none"
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="condition">Condition</Label>
                            <select
                                id="condition"
                                name="condition"
                                className="w-full h-12 border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none transition-colors"
                            >
                                <option value="">Select Condition</option>
                                {["New with tags", "Like new", "Good", "Fair"].map(cond => (
                                    <option key={cond} value={cond}>{cond}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="size">Size</Label>
                            <Input id="size" name="size" placeholder="e.g., Medium / 38" className="h-12" />
                        </div>
                    </div>
                </section>

                <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-6">
                    <p className="text-xs text-muted-foreground max-w-xs text-center sm:text-left">
                        By publishing, you agree to our community guidelines.
                    </p>
                    <Button
                        type="submit"
                        isLoading={loading}
                        size="lg"
                        className="px-12 w-full sm:w-auto"
                    >
                        Publish Listing
                    </Button>
                </div>
            </form>
        </div>
    );
}
