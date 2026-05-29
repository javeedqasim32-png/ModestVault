"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { resetPassword } from "@/app/actions/auth";

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess(false);

        const formData = new FormData(e.currentTarget);
        if (token) {
            formData.append("token", token);
        }

        const password = formData.get("password") as string;
        const confirmPassword = formData.get("confirmPassword") as string;

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            setLoading(false);
            return;
        }

        try {
            const res = await resetPassword(formData);
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

    if (!token) {
        return (
            <div className="space-y-6 text-center">
                <div className="bg-red-50 text-red-700 text-sm p-5 border border-red-200 leading-relaxed">
                    Invalid or missing password reset token. Please request a new link.
                </div>
                <Link href="/forgot-password" className="block">
                    <Button className="w-full h-12">
                        Request Reset Link
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="text-center space-y-3">
                <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
                    Reset Password
                </h1>
                <p className="text-sm text-muted-foreground">
                    Choose a secure new password for your account
                </p>
            </div>

            {success ? (
                <div className="space-y-6">
                    <div className="bg-green-50 text-green-800 text-sm p-5 border border-green-200 text-center leading-relaxed">
                        Your password has been successfully updated.
                    </div>
                    <Link href="/login" className="block">
                        <Button className="w-full h-12">
                            Sign In Now
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
                        <Label htmlFor="password">New Password</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            required
                            placeholder="At least 6 characters"
                            className="h-12"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input
                            id="confirmPassword"
                            name="confirmPassword"
                            type="password"
                            required
                            placeholder="Re-enter password"
                            className="h-12"
                        />
                    </div>

                    <Button
                        type="submit"
                        isLoading={loading}
                        className="w-full h-12 mt-2"
                    >
                        Update Password
                    </Button>
                </form>
            )}
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="flex min-h-[calc(100vh-140px)] w-full items-center justify-center bg-background px-6 py-16">
            <div className="w-full max-w-md border border-border p-8 md:p-12 bg-background">
                <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground uppercase tracking-widest">Loading...</div>}>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </div>
    );
}
