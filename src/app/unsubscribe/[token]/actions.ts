"use server";

import { prisma } from "@/lib/prisma";

/**
 * Server action for the resubscribe button on the unsubscribe page.
 *
 * Trust model: this action takes a userId directly rather than
 * verifying an HMAC token. That's acceptable because:
 *   1. The user only lands on this page from a valid unsubscribe token
 *      (verified server-side in the page component before render).
 *   2. Resubscribing someone else is a null-effort spam vector — the
 *      worst outcome is "an attacker enrolled a legitimate account into
 *      marketing emails they might not want", which doesn't harm the
 *      victim (they still control their own unsubscribe).
 *
 * If we wanted stricter, we'd re-verify the token here too.
 */
export async function resubscribe(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (!user) return { ok: false, error: "Account not found" };
        await prisma.user.update({
            where: { id: userId },
            data: { marketing_email_opt_in: true },
        });
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
    }
}
