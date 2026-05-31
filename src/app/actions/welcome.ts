"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Stamp the user's welcome_seen_at so the post-signup welcome modal never
 * appears for them again. Idempotent — calling it twice is a no-op the
 * second time because the home page only mounts the modal when the column
 * is null.
 */
export async function markWelcomeSeen() {
    const session = await auth();
    if (!session?.user?.id) return;
    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { welcome_seen_at: new Date() },
        });
    } catch (err) {
        console.error("[markWelcomeSeen] failed:", err);
    }
}
