import { NextRequest, NextResponse } from "next/server";
import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { apiError, type ApiErrorBody } from "./errors";

/**
 * Parse + validate a JSON request body against a zod schema. Returns the typed
 * value or a 400 NextResponse the route can return directly.
 *
 *   const parsed = await parseJsonBody(req, LoginSchema);
 *   if (parsed instanceof NextResponse) return parsed;
 *   const { email, password } = parsed;
 */
export async function parseJsonBody<T extends ZodTypeAny>(
    req: NextRequest,
    schema: T,
): Promise<ZodInfer<T> | NextResponse<ApiErrorBody>> {
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return apiError("INVALID_INPUT", "Request body must be valid JSON.");
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
            const key = issue.path.length > 0 ? issue.path.join(".") : "_";
            // Keep only the first message per field — the client surfaces one
            // error per input anyway.
            if (!fields[key]) fields[key] = issue.message;
        }
        return apiError("INVALID_INPUT", "Please fix the highlighted fields.", fields);
    }
    return result.data as ZodInfer<T>;
}
