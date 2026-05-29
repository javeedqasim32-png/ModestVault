"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { requestPasswordReset } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess(false);

        const formData = new FormData(e.currentTarget);
        try {
            const res = await requestPasswordReset(formData);
            if (res.error) {
                setError(res.error);
            } else {
                setSuccess(true);
            }
        } catch {
            setError("An unexpected error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-[calc(100vh-140px)] w-full items-center justify-center bg-background px-6 py-16">
            <div className="w-full max-w-md border border-border p-8 md:p-12 bg-background space-y-8">
                <div className="text-center space-y-3">
                    <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
                        Forgot Password
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Enter your email address to receive a password reset link
                    </p>
                </div>

                {success ? (
                    <div className="space-y-6">
                        <div className="bg-green-50 text-green-800 text-sm p-5 border border-green-200 text-center leading-relaxed">
                            If an account exists with that email, a password reset link has been sent. Please check your inbox and spam folder.
                        </div>
                        <Link href="/login" className="block">
                            <Button className="w-full h-12">
                                Back to Sign In
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="bg-red-50 text-red-700 text-sm p-4 border border-red-200 text-center">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                required
                                placeholder="you@example.com"
                                className="h-12"
                            />
                        </div>

                        <Button
                            type="submit"
                            isLoading={loading}
                            className="w-full h-12 mt-2"
                        >
                            Send Reset Link
                        </Button>

                        <div className="text-center border-t border-border pt-6">
                            <p className="text-sm text-muted-foreground">
                                Remember your password?{" "}
                                <Link href="/login" className="text-foreground font-medium hover:opacity-70 transition-opacity">
                                    Sign In
                                </Link>
                            </p>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
