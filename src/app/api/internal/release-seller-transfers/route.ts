import { NextResponse } from "next/server";
import { releaseEligibleSellerTransfers } from "@/lib/seller-transfer-release";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
    const expected = process.env.INTERNAL_CRON_SECRET;
    if (!expected) return false;
    const provided = request.headers.get("x-cron-secret");
    return provided === expected;
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 250) : 50;

    try {
        const summary = await releaseEligibleSellerTransfers(limit);
        return NextResponse.json({ success: true, summary });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to release seller transfers.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET(request: Request) {
    return POST(request);
}
