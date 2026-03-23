"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const registered = searchParams.get("registered");
    const loggedOut = searchParams.get("loggedOut");
    const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");

        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        try {
            const res = await signIn("credentials", {
                redirect: false,
                email,
                password,
                redirectTo: callbackUrl
            });

            if (res?.error) {
                setError("Invalid email or password");
                setLoading(false);
            } else {
                router.push(callbackUrl);
                router.refresh();
            }
        } catch {
            setError("An unexpected error occurred");
            setLoading(false);
        }
    }

    return (
        <div className="space-y-8">
            <div className="text-center space-y-3">
                <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
                    Welcome Back
                </h1>
                <p className="text-sm text-muted-foreground">
                    Sign in to access your account
                </p>
            </div>

            {registered && (
                <div className="bg-green-50 text-green-800 text-sm p-4 border border-green-200 text-center">
                    Account created successfully. Please sign in.
                </div>
            )}

            {loggedOut && (
                <div className="bg-green-50 text-green-800 text-sm p-4 border border-green-200 text-center">
                    You have been logged out.
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-700 text-sm p-4 border border-red-200 text-center">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
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

                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="password">Password</Label>
                        <Link href="#" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider">
                            Forgot?
                        </Link>
                    </div>
                    <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        className="h-12"
                    />
                </div>

                <Button
                    type="submit"
                    isLoading={loading}
                    className="w-full h-12 mt-2"
                >
                    Sign In
                </Button>
            </form>

            <div className="text-center border-t border-border pt-6">
                <p className="text-sm text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <Link href="/signup" className="text-foreground font-medium hover:opacity-70 transition-opacity">
                        Create Account
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <div className="flex min-h-[calc(100vh-140px)] w-full items-center justify-center bg-background px-6 py-16">
            <div className="w-full max-w-md border border-border p-8 md:p-12 bg-background">
                <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground uppercase tracking-widest">Loading...</div>}>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    );
}
