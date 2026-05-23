import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { buildS3ImageUrl, getS3BucketName, s3, uploadFile } from "@/lib/s3";

// Simple in-memory per-user cooldown. For multi-instance production, swap for Redis/DB.
const LAST_GENERATE_BY_USER = new Map<string, number>();
const COOLDOWN_MS = Number(process.env.AI_GENERATE_COOLDOWN_MS || 30_000);

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Slot roles, in the order they should be sent to OpenAI. Image 1 is always the
// studio template; subsequent images are the seller-uploaded garment references.
type SlotRole = "fullOutfit" | "top" | "bottom" | "dupatta" | "closeup";
const SLOT_ORDER: ReadonlyArray<{ key: SlotRole; label: string }> = [
  { key: "fullOutfit", label: "Full Outfit" },
  { key: "top", label: "Top" },
  { key: "bottom", label: "Bottom" },
  { key: "dupatta", label: "Dupatta" },
  { key: "closeup", label: "Close Up" },
];

// Pad/resize any input to a 1024x1536 transparent PNG. OpenAI's images/edits
// endpoint expects PNG with consistent dimensions across the image[] array.
async function prepareImageForOpenAI(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .resize(1024, 1536, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const session = await auth();
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // 2. Cooldown
    const last = LAST_GENERATE_BY_USER.get(userId) || 0;
    const now = Date.now();
    if (now - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return NextResponse.json({ error: `Please wait ${wait}s before generating again.` }, { status: 429 });
    }

    // 3. Config validation
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
    }
    const staticRefUrl = process.env.AI_STATIC_REFERENCE_URL;
    if (!staticRefUrl) {
      return NextResponse.json({ error: "AI studio template URL is not configured." }, { status: 500 });
    }
    const bucket = getS3BucketName();
    if (!bucket) {
      return NextResponse.json({ error: "S3 bucket is not configured" }, { status: 500 });
    }

    // 4. Parse per-slot files. Frontend sends each filled slot as
    //    reference_<slotKey> so the backend can route by role.
    const slotFiles = new Map<SlotRole, File>();
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      try {
        const form = await req.formData();
        for (const slot of SLOT_ORDER) {
          const v = form.get(`reference_${slot.key}`);
          if (v && typeof (v as File).arrayBuffer === "function") {
            slotFiles.set(slot.key, v as File);
          }
        }
      } catch (formErr) {
        console.error("Failed to parse multipart form data:", formErr);
        return NextResponse.json({ error: "Invalid form data payload." }, { status: 400 });
      }
    }

    if (slotFiles.size === 0) {
      return NextResponse.json({ error: "At least one garment photo is required to generate the cover." }, { status: 400 });
    }

    // Validate every present file
    for (const [slotKey, file] of slotFiles) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: `${slotKey} image (${file.name}) exceeds the maximum allowed size of 10MB.` }, { status: 400 });
      }
      const mt = file.type || "image/png";
      if (!ALLOWED_MIME_TYPES.includes(mt)) {
        return NextResponse.json({ error: `${slotKey} image has an invalid file type. Only PNG, JPEG, and WebP are allowed.` }, { status: 400 });
      }
    }

    // 5. Fetch template from S3. Primary path: S3 SDK with our creds (works for
    //    private objects too). Fallback: direct HTTP fetch of staticRefUrl.
    let staticKey = "";
    try {
      const urlObj = new URL(staticRefUrl);
      staticKey = urlObj.pathname.replace(/^\//, "");
    } catch {
      staticKey = "";
    }

    let templateBuffer: Buffer | null = null;
    if (staticKey) {
      try {
        const s3Res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: staticKey }));
        if (s3Res.Body) {
          const bytes = await s3Res.Body.transformToByteArray();
          templateBuffer = Buffer.from(bytes);
        }
      } catch (s3Err) {
        console.warn("Failed to download template via S3 SDK, trying HTTP fallback...", s3Err);
      }
    }
    if (!templateBuffer) {
      try {
        const res = await fetch(staticRefUrl);
        if (!res.ok) throw new Error(`HTTP fetch failed with status ${res.status}`);
        const arr = await res.arrayBuffer();
        templateBuffer = Buffer.from(arr);
      } catch (httpErr) {
        console.error("Both S3 and HTTP fallback failed for template:", httpErr);
        return NextResponse.json({ error: "Failed to load the studio template image." }, { status: 500 });
      }
    }

    // 6. Backup all garment uploads to S3 (best-effort audit trail), then read
    //    their bytes and prepare every image (template + garments) for OpenAI.
    const garmentBuffers = new Map<SlotRole, Buffer>();
    for (const [slotKey, file] of slotFiles) {
      const buf = Buffer.from(await file.arrayBuffer());
      garmentBuffers.set(slotKey, buf);
      try {
        const ext = file.name?.split(".").pop() || "png";
        const refKey = `ai-refs/${userId}/${randomUUID()}-${slotKey}.${ext}`;
        await uploadFile(buf, refKey, file.type || "image/png", bucket);
      } catch (err) {
        console.warn(`Audit-trail S3 backup of ${slotKey} failed (non-fatal):`, err);
      }
    }

    // 7. Build the multipart form for OpenAI. image[0] is the template, then
    //    each filled slot in SLOT_ORDER. Track which slots ended up in the
    //    payload so the prompt can describe them by role.
    const formData = new FormData();
    let processedTemplate: Buffer;
    try {
      processedTemplate = await prepareImageForOpenAI(templateBuffer);
    } catch (err) {
      console.error("Failed to prepare template:", err);
      return NextResponse.json({ error: "Failed to prepare the studio template." }, { status: 500 });
    }
    formData.append("image[]", new Blob([new Uint8Array(processedTemplate)], { type: "image/png" }), "template.png");

    const sentSlots: SlotRole[] = [];
    for (const slot of SLOT_ORDER) {
      const buf = garmentBuffers.get(slot.key);
      if (!buf) continue;
      let processed: Buffer;
      try {
        processed = await prepareImageForOpenAI(buf);
      } catch (err) {
        console.error(`Failed to prepare ${slot.key}:`, err);
        return NextResponse.json({ error: `Failed to prepare ${slot.key} image.` }, { status: 500 });
      }
      formData.append("image[]", new Blob([new Uint8Array(processed)], { type: "image/png" }), `${slot.key}.png`);
      sentSlots.push(slot.key);
    }

    // 8. Build the prompt. Image 1 is the template (model + studio). The order
    //    of the seller's references in sentSlots maps to Image 2, Image 3, etc.
    const roleDescriptionFor = (slot: SlotRole): string => {
      switch (slot) {
        case "fullOutfit": return "the full outfit reference (primary silhouette, complete styling)";
        case "top": return "the top piece (kameez / blouse)";
        case "bottom": return "the bottom piece (shalwar / pants / skirt)";
        case "dupatta": return "the dupatta (with its drape, transparency, and border work)";
        case "closeup": return "a close-up reference (embroidery, sleeves, or detail work)";
      }
    };

    const imageRoleLines = sentSlots.map((slot, idx) => `- Image ${idx + 2}: ${roleDescriptionFor(slot)}`).join("\n");

    const promptText = `Create an ultra-realistic luxury Pakistani fashion editorial cover photo.

CRITICAL:
The image must look like REAL professional fashion photography — not AI generated.
Prioritize photorealism, natural human appearance, and editorial polish over strict symmetry.

IMAGE ROLES:
- Image 1 provides the pose, framing, background (off-white wall with door molding), flooring (light grey low-pile carpet), and soft studio lighting. The neutral beige bodysuit shown in Image 1 is not the outfit — it must be fully replaced by the garment from the uploaded references below.
${imageRoleLines}

Render the model wearing the complete outfit composed from the uploaded references. Preserve the exact garment colors, prints, embroidery, neckline, sleeve length, hem, and silhouette of every reference image. If a dupatta is visible in any reference, drape it naturally over the shoulder.

MODEL APPEARANCE:
- Beautiful, attractive South Asian / Pakistani female model
- Fair skin tone with warm undertones, soft natural makeup
- Graceful, photogenic features; long lashes; defined eyebrows
- Dark hair styled elegantly (low bun with a few soft face strands, similar to Image 1)
- Slender, well-proportioned build
- Natural human skin texture (visible pores, not airbrushed)
- Natural hands and fingers
- Soft confident expression, relaxed editorial posture
- Premium designer campaign appearance

FRAMING:
- Full-body vertical portrait, model centered
- Head-to-toe with no cropping at the feet or head
- Soft cinematic studio lighting with realistic shadows

AVOID:
- Changing garment colors
- Removing major garment pieces
- Inventing jewelry, handbags, scarves, shoes, or accessories that are NOT visible in the uploaded references
- Any text, logos, brand tags, watermarks, or signage anywhere in the image
- AI beauty perfection (no plastic/3D-render appearance, no mannequin pose)
- Unrealistic anatomy, distorted hands, or fantasy couture redesigns

The final result should resemble a real luxury Pakistani lawn brand campaign photographed with a DSLR camera — elegant, photorealistic, faithful to the uploaded outfit, with an attractive fair-toned model.`;

    formData.append("model", "gpt-image-2-2026-04-21");
    formData.append("prompt", promptText);
    formData.append("n", "1");
    formData.append("size", req.headers.get("x-image-size") || "1024x1536");
    formData.append("quality", "high");

    // 9. Call OpenAI images/edits
    let openAiRes: Response;
    try {
      openAiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: formData,
      });
    } catch (fetchErr) {
      console.error("Network error calling OpenAI API:", fetchErr);
      return NextResponse.json({ error: "Failed to reach the image generation service." }, { status: 503 });
    }

    if (!openAiRes.ok) {
      const errBody = await openAiRes.text();
      console.error("OpenAI images/edits error:", openAiRes.status, errBody);

      if (openAiRes.status === 429) {
        return NextResponse.json({ error: "The image generation service is busy. Please wait a moment and try again." }, { status: 429 });
      }
      const baseMessage = "OpenAI was unable to generate the cover photo. Please check your image parameters.";
      const surfaceDetail = process.env.NODE_ENV === "development" ? ` Detail: ${errBody.slice(0, 600)}` : "";
      return NextResponse.json({ error: baseMessage + surfaceDetail }, { status: 502 });
    }

    // 10. Resolve generated image to bytes
    let json: { data?: Array<{ b64_json?: string; url?: string }> };
    try {
      json = await openAiRes.json();
    } catch (parseErr) {
      console.error("Failed to parse OpenAI JSON response:", parseErr);
      return NextResponse.json({ error: "Failed to process image generation response." }, { status: 502 });
    }

    const b64 = json?.data?.[0]?.b64_json;
    const hostedUrl = json?.data?.[0]?.url;
    let imageBuffer: Buffer | null = null;
    if (b64) {
      imageBuffer = Buffer.from(b64, "base64");
    } else if (hostedUrl) {
      try {
        const remote = await fetch(hostedUrl);
        if (!remote.ok) {
          console.error("Failed to fetch hosted generated image:", remote.status);
          return NextResponse.json({ error: "Failed to retrieve the generated cover photo." }, { status: 502 });
        }
        imageBuffer = Buffer.from(await remote.arrayBuffer());
      } catch (err) {
        console.error("Error fetching hosted URL:", err);
        return NextResponse.json({ error: "Failed to download the generated cover photo." }, { status: 502 });
      }
    } else {
      console.error("OpenAI response contained no image", json);
      return NextResponse.json({ error: "No image returned by the generation engine." }, { status: 502 });
    }

    // 11. Save to S3
    let finalImageUrl: string;
    try {
      const imageId = randomUUID();
      const outKey = `ai-generated/${userId}/${imageId}.png`;
      await uploadFile(imageBuffer, outKey, "image/png", bucket);
      finalImageUrl = buildS3ImageUrl(outKey, bucket);
    } catch (err) {
      console.error("Failed to save final image to S3:", err);
      return NextResponse.json({ error: "Failed to save the generated cover image." }, { status: 500 });
    }

    // 12. Mark cooldown
    LAST_GENERATE_BY_USER.set(userId, Date.now());

    return NextResponse.json({ imageUrl: finalImageUrl });
  } catch (err) {
    console.error("Unexpected error in /api/ai/generate-cover:", err);
    return NextResponse.json({ error: "An unexpected system error occurred." }, { status: 500 });
  }
}
