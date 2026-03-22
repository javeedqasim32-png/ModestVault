"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startSignup, verifyEmail, resendCode } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<"DETAILS" | "VERIFY">("DETAILS");
    const [error, setError] = useState<string>("");
    const [successMessage, setSuccessMessage] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState<string>("");

    async function handleDetailsSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccessMessage("");

        const formData = new FormData(e.currentTarget);
        try {
            const res = await startSignup(formData);
            if (res?.error) {
                setError(res.error);
            } else if (res?.success && res.email) {
                setEmail(res.email);
                setStep("VERIFY");
            }
        } catch (err) {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    }

    async function handleVerificationSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccessMessage("");

        const formData = new FormData(e.currentTarget);
        const code = formData.get("code") as string;

        try {
            const res = await verifyEmail(email, code);
            if (res?.error) {
                setError(res.error);
                setLoading(false);
            } else if (res?.success) {
                setSuccessMessage("Account created. Redirecting...");
                setTimeout(() => {
                    router.push("/login?registered=true");
                }, 1500);
            }
        } catch (err) {
            setError("An unexpected error occurred.");
            setLoading(false);
        }
    }

    async function handleResendCode() {
        if (!email) return;
        setLoading(true);
        setError("");
        setSuccessMessage("");
        try {
            const res = await resendCode(email);
            if (res?.error) {
                setError(res.error);
            } else if (res?.success) {
                setSuccessMessage(res.message || "A new code has been sent.");
            }
        } catch (err) {
            setError("Failed to resend the code.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-[calc(100vh-140px)] w-full items-center justify-center bg-background px-6 py-16">
            <div className="w-full max-w-md border border-border p-8 md:p-12 bg-background">
                {step === "DETAILS" ? (
                    <div className="space-y-8">
                        <div className="text-center space-y-3">
                            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
                                Create Account
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Join Modaire to start shopping and selling
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-50 text-red-700 text-sm p-4 border border-red-200 text-center">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleDetailsSubmit} className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="first_name">First Name</Label>
                                    <Input id="first_name" name="first_name" required className="h-12" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="last_name">Last Name</Label>
                                    <Input id="last_name" name="last_name" required className="h-12" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input id="email" name="email" type="email" required className="h-12" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                    className="h-12"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number</Label>
                                <Input id="phone" name="phone" type="tel" required placeholder="(123) 456-7890" className="h-12" />
                            </div>

                            <div className="space-y-4 pt-4 border-t border-border/50">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Home Address (Optional)</p>
                                <div className="space-y-2">
                                    <Label htmlFor="street1">Street Address</Label>
                                    <Input id="street1" name="street1" placeholder="123 Main St" className="h-12" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="city">City</Label>
                                        <Input id="city" name="city" placeholder="New York" className="h-12" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="state">State</Label>
                                        <Input id="state" name="state" placeholder="NY" className="h-12" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="zip">Zip Code</Label>
                                        <Input id="zip" name="zip" placeholder="10001" className="h-12" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="country">Country</Label>
                                        <Input id="country" name="country" defaultValue="US" className="h-12" />
                                    </div>
                                </div>
                            </div>

                            <Button type="submit" isLoading={loading} className="w-full h-12 mt-4">
                                Create Account
                            </Button>
                        </form>

                        <div className="text-center border-t border-border pt-6">
                            <p className="text-sm text-muted-foreground">
                                Already have an account?{" "}
                                <Link href="/login" className="text-foreground font-medium hover:opacity-70 transition-opacity">
                                    Sign In
                                </Link>
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className="text-center space-y-3">
                            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
                                Verify Email
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                A 6-digit code was sent to <strong className="text-foreground">{email}</strong>
                            </p>
                        </div>

                        {successMessage && (
                            <div className="bg-green-50 text-green-800 text-sm p-4 border border-green-200 text-center">
                                {successMessage}
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-50 text-red-700 text-sm p-4 border border-red-200 text-center">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleVerificationSubmit} className="space-y-6">
                            <div className="space-y-2 text-center">
                                <Label htmlFor="code">Verification Code</Label>
                                <input
                                    id="code"
                                    name="code"
                                    type="text"
                                    required
                                    maxLength={6}
                                    pattern="\d{6}"
                                    placeholder="000000"
                                    className="w-full h-16 border border-border bg-background text-center text-3xl tracking-[0.5em] font-semibold focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>

                            <Button type="submit" isLoading={loading} className="w-full h-12">
                                Verify
                            </Button>

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    type="button"
                                    onClick={handleResendCode}
                                    disabled={loading}
                                    className="text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                >
                                    Resend Code
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setStep("DETAILS"); setError(""); setSuccessMessage(""); }}
                                    disabled={loading}
                                    className="text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Back
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
