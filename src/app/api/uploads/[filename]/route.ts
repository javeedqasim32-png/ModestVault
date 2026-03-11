import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ filename: string }> | { filename: string } }
) {
    try {
        const resolvedParams = await context.params;
        const filename = resolvedParams.filename;

        const filePath = join(process.cwd(), "public/uploads", filename);

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
