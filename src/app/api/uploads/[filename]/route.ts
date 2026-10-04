import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, basename, resolve, sep } from "path";
import { existsSync } from "fs";

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ filename: string }> | { filename: string } }
) {
    try {
        const resolvedParams = await context.params;

        // SECURITY: the raw param is attacker-controlled and may contain path
        // traversal (e.g. `..%2f..%2f.env`, which Next.js decodes to
        // `../../.env`). Collapse it to a bare filename so it can never
        // reference anything outside public/uploads.
        const filename = basename(resolvedParams.filename);

        const uploadsDir = resolve(process.cwd(), "public/uploads");
        const filePath = join(uploadsDir, filename);

        // Defence in depth: confirm the resolved path is still inside the
        // uploads directory before touching the filesystem.
        if (filePath !== uploadsDir && !filePath.startsWith(uploadsDir + sep)) {
            return new NextResponse("Not Found", { status: 404 });
        }

        if (!existsSync(filePath)) {
            return new NextResponse("Not Found", { status: 404 });
        }

        const buffer = await readFile(filePath);

        // Determine content type
        const ext = filename.split(".").pop()?.toLowerCase();
        let mimeType = "image/jpeg";
        if (ext === "png") mimeType = "image/png";
        else if (ext === "webp") mimeType = "image/webp";
        else if (ext === "gif") mimeType = "image/gif";
        else if (ext === "svg") mimeType = "image/svg+xml";

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": mimeType,
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (error) {
        console.error("Error serving uploaded file:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
