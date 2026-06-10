"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type NotificationRecord = {
    id: string;
    type: string;
    title: string;
    body: string;
    linkUrl: string | null;
    readAt: number | null;
    createdAt: number;
};

type NotificationRow = {
    id: string;
    type: string;
    title: string;
    body: string;
    link_url: string | null;
    read_at: Date | null;
    created_at: Date;
};

// Defensive delegate fetch — matches the [[getConversationDelegate]] pattern in
// messages.ts. Returns undefined if the running Prisma client is stale (e.g.
// dev server started before `prisma generate` ran), so callers degrade
// gracefully instead of throwing "cannot read properties of undefined".
function getNotificationDelegate() {
    return (prisma as unknown as {
        notification?: {
            create: (args: unknown) => Promise<unknown>;
            findMany: (args: unknown) => Promise<NotificationRow[]>;
            findUnique: (args: unknown) => Promise<{ user_id: string; read_at: Date | null } | null>;
            update: (args: unknown) => Promise<unknown>;
            updateMany: (args: unknown) => Promise<unknown>;
            count: (args: unknown) => Promise<number>;
        };
    }).notification;
}

function toNotificationRecord(row: NotificationRow): NotificationRecord {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        linkUrl: row.link_url,
        readAt: row.read_at ? row.read_at.getTime() : null,
        createdAt: row.created_at.getTime(),
    };
}

/**
 * Server-side helper to insert a notification. Best-effort: callers should
 * already have completed the primary work (sale transaction, email send) —
 * a failed insert here logs but does not throw, because the notification is
 * an enhancement, not the source of truth.
 */
export async function createNotification(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    linkUrl?: string | null;
}) {
    const delegate = getNotificationDelegate();
    if (!delegate) {
        console.error("createNotification: prisma.notification is undefined (stale client?)");
        return;
    }
    try {
        await delegate.create({
            data: {
                user_id: input.userId,
                type: input.type,
                title: input.title,
                body: input.body,
                link_url: input.linkUrl ?? null,
            },
        });
        // Invalidate the layout-segment caches that render the bell badge so
        // the next soft navigation picks up the new unread count without a
        // hard refresh. createNotification is called from server actions and
        // background workers; both are safe contexts for revalidatePath.
        revalidatePath("/");
        revalidatePath("/sell");
    } catch (error) {
        console.error("createNotification error:", error);
    }
}

export async function listMyNotifications(input?: { limit?: number }): Promise<NotificationRecord[]> {
    const session = await auth();
    if (!session?.user?.id) return [];
    const delegate = getNotificationDelegate();
    if (!delegate) return [];
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);
    const rows = await delegate.findMany({
        where: { user_id: session.user.id },
        orderBy: { created_at: "desc" },
        take: limit,
    });
    return rows.map(toNotificationRecord);
}

export async function getUnreadNotificationCountForSessionUser() {
    const session = await auth();
    if (!session?.user?.id) return 0;
    const delegate = getNotificationDelegate();
    if (!delegate) return 0;
    return delegate.count({
        where: { user_id: session.user.id, read_at: null },
    });
}

/**
 * Per-type unread counts for the current user. Used to drive the Sold and
 * Pending tab badges on the sell dashboard (server-side, cross-device,
 * replaces the localStorage-based "viewed" tracking that didn't survive
 * iOS Safari storage eviction).
 *
 * Returns a Record<type, count> with zeros filled in for any requested type
 * that has no unread rows, so the caller never has to deal with missing keys.
 */
export async function getUnreadNotificationCountsByType(types: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = Object.fromEntries(types.map((t) => [t, 0]));
    const session = await auth();
    if (!session?.user?.id) return result;
    const delegate = getNotificationDelegate();
    if (!delegate) return result;
    if (types.length === 0) return result;

    // One count per type. We could use a single groupBy via $queryRaw, but
    // n parallel COUNTs against an already-indexed (user_id, read_at) is
    // simple and fast for the 2-3 types we care about.
    const userId = session.user.id;
    const counts = await Promise.all(
        types.map((type) =>
            delegate.count({
                where: { user_id: userId, type, read_at: null },
            })
        )
    );
    types.forEach((type, idx) => {
        result[type] = counts[idx];
    });
    return result;
}

/**
 * Bulk-mark every unread notification of a given type as read for the
 * current user. Called from the seller dashboard when the seller clicks the
 * Sold or Pending tab — they've now "seen" that batch of activity, so the
 * tab badge AND the corresponding bell-icon entries both quiet down.
 */
export async function markNotificationsTypeRead(type: string): Promise<{ success: true } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) return { error: "Not signed in." };
    const delegate = getNotificationDelegate();
    if (!delegate) return { error: "Notifications unavailable." };
    await delegate.updateMany({
        where: { user_id: session.user.id, type, read_at: null },
        data: { read_at: new Date() },
    });
    revalidatePath("/");
    revalidatePath("/sell");
    return { success: true };
}

export async function markNotificationRead(notificationId: string): Promise<{ success: true } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) return { error: "Not signed in." };
    const delegate = getNotificationDelegate();
    if (!delegate) return { error: "Notifications unavailable." };
    const existing = await delegate.findUnique({
        where: { id: notificationId },
        select: { user_id: true, read_at: true },
    });
    if (!existing || existing.user_id !== session.user.id) {
        return { error: "Notification not found." };
    }
    if (!existing.read_at) {
        await delegate.update({
            where: { id: notificationId },
            data: { read_at: new Date() },
        });
        revalidatePath("/");
    }
    return { success: true };
}

export async function markAllNotificationsRead(): Promise<{ success: true } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) return { error: "Not signed in." };
    const delegate = getNotificationDelegate();
    if (!delegate) return { error: "Notifications unavailable." };
    await delegate.updateMany({
        where: { user_id: session.user.id, read_at: null },
        data: { read_at: new Date() },
    });
    revalidatePath("/");
    return { success: true };
}
