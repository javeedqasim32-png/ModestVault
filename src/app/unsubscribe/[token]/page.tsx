import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { ResubscribeButton } from "./ResubscribeButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe. Verify token → flip the user's
 * marketing_email_opt_in to false → render a friendly confirmation.
 *
 * CAN-SPAM requires that the unsubscribe path work without login and
 * without any additional interaction. This page satisfies both.
 */
export default async function UnsubscribePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const payload = verifyUnsubscribeToken(token);

    if (!payload) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-6">
                <div className="w-full rounded-2xl border border-border bg-card p-8 text-center">
                    <h1 className="text-2xl font-bold text-foreground">Link expired or invalid</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        This unsubscribe link is no longer valid. To update your email preferences,{" "}
                        <Link href="/login" className="underline">sign in</Link>{" "}
                        or email shopmodaire@gmail.com.
                    </p>
                </div>
            </div>
        );
    }

    const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, first_name: true, marketing_email_opt_in: true },
    });

    if (!user) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-6">
                <div className="w-full rounded-2xl border border-border bg-card p-8 text-center">
                    <h1 className="text-2xl font-bold text-foreground">Account not found</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        We couldn&apos;t find your account. Contact shopmodaire@gmail.com if you need help.
                    </p>
                </div>
            </div>
        );
    }

    // Flip on hit. Idempotent — if the user's already opted out, this
    // is a no-op and we show the same confirmation.
    if (user.marketing_email_opt_in) {
        await prisma.user.update({
            where: { id: user.id },
            data: { marketing_email_opt_in: false },
        });
    }

    return (
        <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-6">
            <div className="w-full rounded-2xl border border-border bg-card p-8 text-center">
                <h1 className="font-serif text-3xl font-bold text-foreground">You&apos;re unsubscribed</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                    {user.first_name ? `${user.first_name}, ` : ""}
                    we&apos;ve removed <strong className="text-foreground">{user.email}</strong> from Modaire marketing emails.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                    You&apos;ll still get transactional emails about your orders, messages, and account activity — those are required to run your account.
                </p>
                <div className="mt-6 flex flex-col items-center gap-3">
                    <ResubscribeButton userId={user.id} />
                    <Link href="/" className="text-xs text-muted-foreground underline hover:text-foreground">
                        Back to Modaire
                    </Link>
                </div>
            </div>
        </div>
    );
}
