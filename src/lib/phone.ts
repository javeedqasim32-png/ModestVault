export function digitsOnly(value: string) {
    return (value || "").replace(/\D/g, "");
}

export function normalizeUsPhoneInput(value: string) {
    const digits = digitsOnly(value);
    if (digits.length === 10) return `1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return digits;
    return digits;
}

export function normalizePhoneForCarrier(value: string, fallback = "5555555555") {
    let digits = normalizeUsPhoneInput(value);
    if (!digits) return fallback;

    if (digits.length < 8) return fallback;
    if (digits.length > 15) digits = digits.slice(0, 15);
    return digits;
}

export function hasCarrierPhoneLength(value: string) {
    const digits = normalizeUsPhoneInput(value);
    return digits.length >= 8 && digits.length <= 15;
}
