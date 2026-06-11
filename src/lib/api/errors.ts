import { NextResponse } from "next/server";

/**
 * Consistent error envelope used by every /api/v1/* route so the Flutter
 * client can rely on a single error parser.
 *
 *   { "error": { "code": "INVALID_INPUT", "message": "Email is required",
 *                 "fields": { "email": "Required" } } }
 *
 * `code` is a short SCREAMING_SNAKE string the client switches on. `message`
 * is human-readable and safe to surface in the UI as-is. `fields` is an
 * optional per-field map used by 400-class validation errors.
 */
export type ApiErrorCode =
    | "INVALID_INPUT"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "RATE_LIMITED"
    | "UNAVAILABLE"
    | "INTERNAL";

export interface ApiErrorBody {
    error: {
        code: ApiErrorCode;
        message: string;
        fields?: Record<string, string>;
    };
}

const STATUS_FOR_CODE: Record<ApiErrorCode, number> = {
    INVALID_INPUT: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    UNAVAILABLE: 503,
    INTERNAL: 500,
};

export function apiError(
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>,
): NextResponse<ApiErrorBody> {
    const body: ApiErrorBody = {
        error: { code, message, ...(fields ? { fields } : {}) },
    };
    return NextResponse.json(body, { status: STATUS_FOR_CODE[code] });
}
