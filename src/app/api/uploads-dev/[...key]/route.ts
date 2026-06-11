import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Dev-only stand-in for S3 presigned PUTs. In NODE_ENV=development,
 * getPresignedPutUrl() returns `/api/uploads-dev/<key>`; clients PUT the
 * file bytes here, and we write them to `public/<key>` — the same place the
 * dev branch of `uploadFile()` writes. In production, getPresignedPutUrl
 * returns a real S3 URL and this route is never hit.
 *
 * No auth here on purpose: the production path is gated by the signature
 * itself, and dev mode is meant to be frictionless on a laptop. Don't enable
 * this route in any deployed environment — the route checks NODE_ENV.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
    if (process.env.NODE_ENV !== "development") {
        return NextResponse.json({ error: "Not available." }, { status: 404 });
    }
    const { key } = await params;
    if (!key || key.length === 0) {
        return NextResponse.json({ error: "Missing key." }, { status: 400 });
    }
    const joined = key.join("/");
    // Guard against path traversal — keys with '..' segments would let a
    // malicious dev-time client write anywhere on disk.
    if (joined.includes("..")) {
        return NextResponse.json({ error: "Invalid key." }, { status: 400 });
    }
    const filePath = path.join(process.cwd(), "public", joined);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const bytes = Buffer.from(await req.arrayBuffer());
    await fs.writeFile(filePath, bytes);
    return new NextResponse(null, { status: 204 });
}
