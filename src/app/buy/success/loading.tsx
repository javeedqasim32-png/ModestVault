import { Loader2 } from "lucide-react";

/**
 * Shown by Next.js automatically while `page.tsx` is server-rendering. The
 * success-page render is heavy: it retrieves the Stripe session, runs the
 * order-finalization transaction (mark listings SOLD, create Purchase + Order
 * rows), buys the Shippo label, and sends emails — totally ~1-4 seconds
 * depending on Stripe/Shippo latency. Without this file, the user lands on a
 * blank browser viewport right after Stripe redirects them back. This file
 * gives them an immediate visual confirmation that something is happening.
 */
export default function BuySuccessLoading() {
    return (
        <div className="container mx-auto flex min-h-[calc(100vh-100px)] items-center justify-center px-6 py-24">
            <div className="flex flex-col items-center gap-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fbf8f5] shadow-[0_2px_12px_rgba(122,90,69,0.10)]">
                    <Loader2 className="h-7 w-7 animate-spin text-[#5f4437]" />
                </div>
                <div className="space-y-2 max-w-sm">
                    <h1 className="text-3xl font-black tracking-tight text-foreground">
                        Confirming your order
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Hold tight — we&apos;re finalizing your payment and getting your shipping ready. This usually takes a few seconds.
                    </p>
                </div>
            </div>
        </div>
    );
}
