export type SkinTone = "fair" | "light" | "medium" | "tan" | "deep";

export const SKIN_TONE_OPTIONS: {
    value: SkinTone;
    label: string;
    swatch: string;
    prompt: string;
}[] = [
    { value: "fair", label: "Fair", swatch: "#F1D5BB", prompt: "fair skin tone with cool pink undertones" },
    { value: "light", label: "Light", swatch: "#DDA984", prompt: "light olive skin tone with warm peach undertones" },
    { value: "medium", label: "Medium", swatch: "#B9784F", prompt: "medium tan skin tone with warm bronze undertones" },
    { value: "tan", label: "Tan", swatch: "#8B5A2B", prompt: "deep tan skin tone with rich golden undertones" },
    { value: "deep", label: "Deep", swatch: "#3D2718", prompt: "deep brown skin tone with warm chocolate undertones" },
];

export const DEFAULT_SKIN_TONE: SkinTone = "medium";

export function getSkinTonePrompt(value: string): string {
    return SKIN_TONE_OPTIONS.find((o) => o.value === value)?.prompt ?? SKIN_TONE_OPTIONS[2].prompt;
}

export function getHijabPrompt(required: boolean): string {
    return required
        ? "Wearing a hijab in a complementary neutral tone that frames the face naturally and matches the outfit's modesty"
        : "Hair styled elegantly in a low bun with a few soft face strands";
}

export function isValidSkinTone(value: unknown): value is SkinTone {
    return typeof value === "string" && SKIN_TONE_OPTIONS.some((o) => o.value === value);
}
