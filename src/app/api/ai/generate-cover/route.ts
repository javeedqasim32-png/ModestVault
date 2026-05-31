import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { buildS3ImageUrl, getS3BucketName, s3, uploadFile } from "@/lib/s3";
import {
  DEFAULT_SKIN_TONE,
  getHijabPrompt,
  getSkinToneTemplateUrl,
  isValidSkinTone,
  type SkinTone,
} from "@/lib/ai-cover-options";

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
  const startTime = Date.now();
  console.log("[AI COVER] Starting generate-cover request...");

  try {
    // 1. Authenticate
    const session = await auth();
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      console.warn("[AI COVER] Rejecting: Authentication required");
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.log(`[AI COVER] Authenticated user: ${userId}`);

    // 2. Cooldown
    const last = LAST_GENERATE_BY_USER.get(userId) || 0;
    const now = Date.now();
    if (now - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      console.warn(`[AI COVER] Rejecting: Cooldown active (${wait}s remaining)`);
      return NextResponse.json({ error: `Please wait ${wait}s before generating again.` }, { status: 429 });
    }

    // 3. Config validation
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      console.error("[AI COVER] Error: OPENAI_API_KEY is not configured");
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
    }
    // The template URL is resolved AFTER the form is parsed because it now
    // depends on the chosen skin tone (per-tone reference photo). Falls back
    // to the legacy AI_STATIC_REFERENCE_URL env var if a tone has no mapped
    // template yet.
    let staticRefUrl: string | null = null;
    const bucket = getS3BucketName();
    if (!bucket) {
      console.error("[AI COVER] Error: S3 bucket is not configured");
      return NextResponse.json({ error: "S3 bucket is not configured" }, { status: 500 });
    }

    // 4. Parse per-slot files
    console.log("[AI COVER] Parsing multipart form data...");
    const slotFiles = new Map<SlotRole, File>();
    let modelSkinTone: SkinTone = DEFAULT_SKIN_TONE;
    let hijabRequired = false;
    let rawHijab = "";
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
        const rawTone = form.get("modelSkinTone")?.toString() ?? "";
        if (isValidSkinTone(rawTone)) {
          modelSkinTone = rawTone;
        }
        rawHijab = form.get("hijabRequired")?.toString() ?? "";
        hijabRequired = rawHijab === "true";
      } catch (formErr) {
        console.error("[AI COVER] Failed to parse multipart form data:", formErr);
        return NextResponse.json({ error: "Invalid form data payload." }, { status: 400 });
      }
    }

    if (rawHijab !== "true" && rawHijab !== "false") {
      return NextResponse.json(
        { error: "Please choose whether the model wears a hijab." },
        { status: 400 }
      );
    }

    // Resolve the studio template URL now that we know the chosen skin tone.
    // Per-tone template wins; legacy env var is the fallback so the route still
    // works for tones that aren't mapped yet (or during template uploads).
    staticRefUrl = getSkinToneTemplateUrl(modelSkinTone) ?? process.env.AI_STATIC_REFERENCE_URL ?? null;
    if (!staticRefUrl) {
      console.error("[AI COVER] Error: no studio template URL available for tone", modelSkinTone);
      return NextResponse.json({ error: "AI studio template URL is not configured." }, { status: 500 });
    }

    console.log(`[AI COVER] Parsed slots: [${Array.from(slotFiles.keys()).join(", ")}]`);

    if (slotFiles.size === 0) {
      console.warn("[AI COVER] Rejecting: No garment photos provided");
      return NextResponse.json({ error: "At least one garment photo is required to generate the cover." }, { status: 400 });
    }

    // Validate every present file
    for (const [slotKey, file] of slotFiles) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        console.warn(`[AI COVER] Rejecting: File ${file.name} for slot ${slotKey} exceeds 10MB (${file.size} bytes)`);
        return NextResponse.json({ error: `${slotKey} image (${file.name}) exceeds the maximum allowed size of 10MB.` }, { status: 400 });
      }
      const mt = file.type || "image/png";
      if (!ALLOWED_MIME_TYPES.includes(mt)) {
        console.warn(`[AI COVER] Rejecting: File ${file.name} for slot ${slotKey} has invalid MIME type ${mt}`);
        return NextResponse.json({ error: `${slotKey} image has an invalid file type. Only PNG, JPEG, and WebP are allowed.` }, { status: 400 });
      }
    }

    // 5. Fetch template from S3/HTTP
    console.log(`[AI COVER] Downloading studio template: ${staticRefUrl}`);
    const downloadStart = Date.now();
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
        console.log(`[AI COVER] Attempting template download via S3 SDK with key: "${staticKey}"`);
        const s3Res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: staticKey }));
        if (s3Res.Body) {
          const bytes = await s3Res.Body.transformToByteArray();
          templateBuffer = Buffer.from(bytes);
          console.log(`[AI COVER] S3 SDK download successful. Bytes: ${templateBuffer.length}`);
        }
      } catch (s3Err) {
        console.warn("[AI COVER] S3 SDK download failed, attempting HTTP fallback...", s3Err);
      }
    }

    if (!templateBuffer) {
      try {
        console.log("[AI COVER] Attempting template HTTP fallback fetch...");
        const res = await fetch(staticRefUrl);
        if (!res.ok) throw new Error(`HTTP fetch failed with status ${res.status}`);
        const arr = await res.arrayBuffer();
        templateBuffer = Buffer.from(arr);
        console.log(`[AI COVER] HTTP fetch successful. Bytes: ${templateBuffer.length}`);
      } catch (httpErr) {
        console.error("[AI COVER] Both S3 and HTTP fallback failed for template:", httpErr);
        return NextResponse.json({ error: "Failed to load the studio template image." }, { status: 500 });
      }
    }
    console.log(`[AI COVER] Template loading completed in ${Date.now() - downloadStart}ms`);

    // 6. S3 Audit trail backup
    console.log("[AI COVER] Saving audit-trail references to S3...");
    const auditStart = Date.now();
    const garmentBuffers = new Map<SlotRole, Buffer>();
    for (const [slotKey, file] of slotFiles) {
      const buf = Buffer.from(await file.arrayBuffer());
      garmentBuffers.set(slotKey, buf);
      try {
        const ext = file.name?.split(".").pop() || "png";
        const refKey = `ai-refs/${userId}/${randomUUID()}-${slotKey}.${ext}`;
        await uploadFile(buf, refKey, file.type || "image/png", bucket);
      } catch (err) {
        console.warn(`[AI COVER] Audit-trail S3 backup of ${slotKey} failed (non-fatal):`, err);
      }
    }
    console.log(`[AI COVER] Audit-trail backups took ${Date.now() - auditStart}ms`);

    // 7. Sharp preparation
    console.log("[AI COVER] Processing images using Sharp (padding & resizing to 1024x1536 PNG)...");
    const sharpStart = Date.now();
    const formData = new FormData();
    let processedTemplate: Buffer;
    try {
      processedTemplate = await prepareImageForOpenAI(templateBuffer);
    } catch (err) {
      console.error("[AI COVER] Failed to prepare template with Sharp:", err);
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
        console.error(`[AI COVER] Failed to prepare ${slot.key} with Sharp:`, err);
        return NextResponse.json({ error: `Failed to prepare ${slot.key} image.` }, { status: 500 });
      }
      formData.append("image[]", new Blob([new Uint8Array(processed)], { type: "image/png" }), `${slot.key}.png`);
      sentSlots.push(slot.key);
    }
    console.log(`[AI COVER] Sharp image processing completed in ${Date.now() - sharpStart}ms`);

    // 8. Build Prompt
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
Prioritize photorealism, natural human appearance, and editorial polish.

IMAGE 1 IS THE BLUEPRINT — PRESERVE EVERYTHING EXCEPT THE OUTFIT:
- Same model: identical face, skin tone, hair, body, hands, fingers
- Same pose, head position, and expression
- Same background, walls, flooring, and decor
- Same lighting, shadows, and color temperature
- Same camera angle, focal length, framing, and depth of field
- The ONLY thing to change is the neutral bodysuit shown in Image 1 — fully replace it with the outfit composed from the uploaded reference images below

${imageRoleLines}

OUTFIT REPLACEMENT:
Render the SAME model from Image 1 wearing the complete outfit composed from the uploaded reference images. Preserve the exact garment colors, prints, embroidery, neckline, sleeve length, hem, and silhouette of every reference image. If a dupatta is visible in any reference, drape it naturally over the shoulder.

HEAD COVERING (overrides the "preserve hair" rule above):
${getHijabPrompt(hijabRequired)}

FRAMING SAFETY:
Match Image 1's framing. Ensure both the model's head/hair AND feet/shoes remain fully visible inside the image boundary with comfortable breathing room above and below, so the image survives standard 3:4 aspect-ratio crops without anything getting cut off.

AVOID:
- Altering the model's face, skin tone, hair (unless overridden by the head-covering rule above), body, or any physical feature shown in Image 1
- Altering the background, flooring, decor, or lighting shown in Image 1
- Changing garment colors from the uploaded references
- Removing major garment pieces from the uploaded references
- Inventing jewelry, handbags, scarves, shoes, or accessories that are NOT visible in the uploaded references
- Any text, logos, brand tags, watermarks, or signage anywhere in the image
- AI beauty perfection (no plastic/3D-render appearance, no mannequin pose)
- Unrealistic anatomy, distorted hands, or fantasy couture redesigns

The final result should look like the model in Image 1 simply changed outfits — same person, same room, same pose, same lighting — just wearing the garment from the uploaded references.`;

    formData.append("model", "gpt-image-2-2026-04-21");
    formData.append("prompt", promptText);
    formData.append("n", "1");
    formData.append("size", req.headers.get("x-image-size") || "1024x1536");
    formData.append("quality", "high");

    // 9. Call OpenAI
    console.log("[AI COVER] Sending request to OpenAI images/edits API...");
    const openAiStart = Date.now();
    let openAiRes: Response;
    try {
      openAiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: formData,
      });
    } catch (fetchErr) {
      console.error("[AI COVER] Network error calling OpenAI API:", fetchErr);
      return NextResponse.json({ error: "Failed to reach the image generation service." }, { status: 503 });
    }

    console.log(`[AI COVER] OpenAI API responded in ${Date.now() - openAiStart}ms. Status: ${openAiRes.status}`);

    if (!openAiRes.ok) {
      const errBody = await openAiRes.text();
      console.error("[AI COVER] OpenAI API returned error status:", openAiRes.status, errBody);

      if (openAiRes.status === 429) {
        return NextResponse.json({ error: "The image generation service is busy. Please wait a moment and try again." }, { status: 429 });
      }
      const baseMessage = "OpenAI was unable to generate the cover photo. Please check your image parameters.";
      const surfaceDetail = process.env.NODE_ENV === "development" ? ` Detail: ${errBody.slice(0, 600)}` : "";
      return NextResponse.json({ error: baseMessage + surfaceDetail }, { status: 502 });
    }

    // 10. Resolve generated image to bytes
    console.log("[AI COVER] Resolving generated cover image bytes...");
    let json: { data?: Array<{ b64_json?: string; url?: string }> };
    try {
      json = await openAiRes.json();
    } catch (parseErr) {
      console.error("[AI COVER] Failed to parse OpenAI JSON response:", parseErr);
      return NextResponse.json({ error: "Failed to process image generation response." }, { status: 502 });
    }

    const b64 = json?.data?.[0]?.b64_json;
    const hostedUrl = json?.data?.[0]?.url;
    let imageBuffer: Buffer | null = null;
    if (b64) {
      imageBuffer = Buffer.from(b64, "base64");
    } else if (hostedUrl) {
      try {
        console.log(`[AI COVER] Downloading generated image from hosted URL: ${hostedUrl.slice(0, 100)}...`);
        const remote = await fetch(hostedUrl);
        if (!remote.ok) {
          console.error("[AI COVER] Failed to fetch hosted generated image. Status:", remote.status);
          return NextResponse.json({ error: "Failed to retrieve the generated cover photo." }, { status: 502 });
        }
        imageBuffer = Buffer.from(await remote.arrayBuffer());
      } catch (err) {
        console.error("[AI COVER] Error fetching hosted URL:", err);
        return NextResponse.json({ error: "Failed to download the generated cover photo." }, { status: 502 });
      }
    } else {
      console.error("[AI COVER] OpenAI response contained no image data", json);
      return NextResponse.json({ error: "No image returned by the generation engine." }, { status: 502 });
    }

    // 11. Save to S3
    console.log("[AI COVER] Uploading final generated cover photo to S3...");
    const uploadStart = Date.now();
    let finalImageUrl: string;
    try {
      const imageId = randomUUID();
      const outKey = `listings/ai-generated/${userId}/${imageId}.png`;
      await uploadFile(imageBuffer, outKey, "image/png", bucket);
      finalImageUrl = buildS3ImageUrl(outKey, bucket);
    } catch (err) {
      console.error("[AI COVER] Failed to save final image to S3:", err);
      return NextResponse.json({ error: "Failed to save the generated cover image." }, { status: 500 });
    }
    console.log(`[AI COVER] Uploading to S3 completed in ${Date.now() - uploadStart}ms`);

    // 12. Mark cooldown
    LAST_GENERATE_BY_USER.set(userId, Date.now());

    console.log(`[AI COVER] Successfully completed cover generation in ${Date.now() - startTime}ms!`);
    return NextResponse.json({ imageUrl: finalImageUrl });
  } catch (err) {
    console.error("[AI COVER] Unexpected critical error:", err);
    return NextResponse.json({ error: "An unexpected system error occurred." }, { status: 500 });
  }
}
