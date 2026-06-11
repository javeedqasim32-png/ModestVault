/**
 * Firebase Cloud Messaging wrapper. firebase-admin is dynamically imported so
 * the dep stays optional — if FCM_ENABLED is false (the default), this module
 * never touches firebase-admin and the build doesn't require the package.
 *
 * Configuration:
 *   FCM_ENABLED                   "true" to actually send; anything else is
 *                                 a no-op (outbox rows still queue, just
 *                                 never get drained — useful before the
 *                                 Firebase project is set up).
 *   FIREBASE_SERVICE_ACCOUNT_JSON  JSON string of a Firebase service-account
 *                                 key with FCM send permission. Paste the
 *                                 full file contents as a single-line env
 *                                 var. Required when FCM_ENABLED=true.
 *
 * Returns the per-token outcome so the dispatcher can mark tokens revoked
 * when Firebase reports them invalid.
 */

let appInitialized = false;
let cachedSend: ((messages: FcmMessage[]) => Promise<FcmSendResult[]>) | null = null;

export interface FcmMessage {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}

export interface FcmSendResult {
    token: string;
    success: boolean;
    invalidToken: boolean;   // true when the token should be revoked locally
    error?: string;
}

export function isFcmEnabled(): boolean {
    return (process.env.FCM_ENABLED ?? "false").toLowerCase() === "true";
}

export async function sendFcmMessages(messages: FcmMessage[]): Promise<FcmSendResult[]> {
    if (!isFcmEnabled()) {
        return messages.map((m) => ({ token: m.token, success: false, invalidToken: false, error: "FCM_DISABLED" }));
    }
    if (cachedSend) return cachedSend(messages);

    // Dynamic import — keeps firebase-admin out of the build graph until
    // FCM_ENABLED flips on. firebase-admin is published as CJS; the ESM
    // dynamic-import surfaces the namespace under `.default`.
    const adminModule = await import("firebase-admin");
    const admin = (adminModule as unknown as { default: typeof import("firebase-admin") }).default ?? adminModule;
    if (!appInitialized) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set but FCM_ENABLED=true");
        const credentials = JSON.parse(raw);
        if ((admin as any).apps.length === 0) {
            (admin as any).initializeApp({
                credential: (admin as any).credential.cert(credentials),
            });
        }
        appInitialized = true;
    }

    cachedSend = async (msgs) => {
        const messaging = (admin as any).messaging();
        const results: FcmSendResult[] = [];
        // sendEachForMulticast batches up to 500 tokens per call. We send in
        // batches of 500 so a single outbox tick can flush a lot of tokens
        // without hitting the per-call cap.
        for (let i = 0; i < msgs.length; i += 500) {
            const batch = msgs.slice(i, i + 500);
            const response = await messaging.sendEachForMulticast({
                tokens: batch.map((m) => m.token),
                notification: {
                    // Title/body are duplicated per-batch — FCM doesn't support
                    // a single multicast with per-token title; we send one
                    // multicast per (title, body) instead.
                    title: batch[0].title,
                    body: batch[0].body,
                },
                data: batch[0].data ?? {},
            });
            response.responses.forEach((r: any, idx: number) => {
                const token = batch[idx].token;
                if (r.success) {
                    results.push({ token, success: true, invalidToken: false });
                } else {
                    const code = r.error?.code || "";
                    const invalid =
                        code === "messaging/invalid-registration-token" ||
                        code === "messaging/registration-token-not-registered" ||
                        code === "messaging/invalid-argument";
                    results.push({
                        token,
                        success: false,
                        invalidToken: invalid,
                        error: r.error?.message || code,
                    });
                }
            });
        }
        return results;
    };

    return cachedSend(messages);
}
