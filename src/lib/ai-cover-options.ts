export type SkinTone = "fair" | "light" | "medium" | "tan" | "deep";

// Per-tone reference photos live in s3://modestvault/Ai-template-skintone/.
// The generate-cover route picks the matching template at request time so the
// AI gets a visual blueprint for the model's skin tone instead of relying on
// text-only descriptors. NOTE: S3 keys are case-sensitive — folder is
// "Ai-template-skintone" with a capital A.
const TEMPLATE_BASE = "https://modestvault.s3.us-east-1.amazonaws.com/Ai-template-skintone";

export const SKIN_TONE_OPTIONS: {
    value: SkinTone;
    label: string;
    swatch: string;
    prompt: string;
    // Full-body studio reference image sent to OpenAI as Image 1 — the AI uses
    // this to lock onto the model's identity and generate a full-body cover.
    template: string;
    // Preview-friendly image shown in the Sell page model picker. Separate
    // from `template` so we can show a tighter, picker-optimized crop without
    // changing the full-body reference the AI generates against.
    thumbnail: string;
}[] = [
    { value: "fair", label: "Fair", swatch: "#F1D5BB", prompt: "fair skin tone with cool pink undertones", template: `${TEMPLATE_BASE}/fair.PNG`, thumbnail: `${TEMPLATE_BASE}/1-2.png` },
    { value: "light", label: "Light", swatch: "#DDA984", prompt: "light olive skin tone with warm peach undertones", template: `${TEMPLATE_BASE}/Light.PNG`, thumbnail: `${TEMPLATE_BASE}/2-2.png` },
    { value: "medium", label: "Medium", swatch: "#B9784F", prompt: "medium tan skin tone with warm bronze undertones", template: `${TEMPLATE_BASE}/Medium.PNG`, thumbnail: `${TEMPLATE_BASE}/3-2.png` },
    { value: "tan", label: "Tan", swatch: "#8B5A2B", prompt: "deep tan skin tone with rich golden undertones", template: `${TEMPLATE_BASE}/Tan.PNG`, thumbnail: `${TEMPLATE_BASE}/4-2.png` },
    { value: "deep", label: "Deep", swatch: "#3D2718", prompt: "deep brown skin tone with warm chocolate undertones", template: `${TEMPLATE_BASE}/deep.PNG`, thumbnail: `${TEMPLATE_BASE}/5.2.png` },
];

export const DEFAULT_SKIN_TONE: SkinTone = "medium";

export function getSkinTonePrompt(value: string): string {
    return SKIN_TONE_OPTIONS.find((o) => o.value === value)?.prompt ?? SKIN_TONE_OPTIONS[2].prompt;
}

export function getSkinToneTemplateUrl(value: string): string | null {
    return SKIN_TONE_OPTIONS.find((o) => o.value === value)?.template ?? null;
}

export function getHijabPrompt(required: boolean): string {
    return required
        ? "Replace the model's visible hair with a hijab in a complementary neutral tone that frames the face naturally and matches the outfit's modesty"
        : "Keep the model's hair exactly as shown in Image 1";
}

export function isValidSkinTone(value: unknown): value is SkinTone {
    return typeof value === "string" && SKIN_TONE_OPTIONS.some((o) => o.value === value);
}
