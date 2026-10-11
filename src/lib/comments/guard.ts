/**
 * Content guard for listing comments — PURE, no imports, so it can run on the
 * client for instant feedback and be unit-tested in isolation.
 *
 * Blocks the scam / fee-circumvention vector: links, emails, phone numbers,
 * and off-platform contact or payment terms. Everything else is allowed.
 */

export const COMMENT_MAX_LENGTH = 500;

const BLOCK_PATTERNS: Array<[RegExp, string]> = [
  [/(https?:\/\/|www\.)\S+/i, "links"],
  // Email must be checked BEFORE bare domains: an address always contains one,
  // and "email addresses" is the more precise message for the user.
  [/[\w.+-]+@[\w-]+\.[\w.-]+/i, "email addresses"],
  [/\b[a-z0-9-]+\.(com|net|org|io|co|app|shop|store|me|info|biz|us|uk|ca|xyz|link)\b/i, "links"],
  [/\b(whats\s?app|telegram|snap\s?chat|cash\s?app|zelle|venmo|pay\s?pal)\b/i, "off-platform contact or payment details"],
];

/**
 * Phone detection without false-positives on prices: a run of 10+ digits
 * (allowing spaces / () . -) that is NOT led by a currency sign.
 * "$1200.00-1500.00" passes; "(555) 123-4567" and "+1 555 123 4567" are caught.
 */
function looksLikePhone(body: string): boolean {
  const re = /(\$)?\+?[\d\s().-]{10,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1]) continue; // currency-led -> a price, not a phone
    const digits = m[0].replace(/\D/g, "").length;
    if (digits >= 10) return true;
  }
  return false;
}

/** Returns a short description of the blocked content, or null if the text is clean. */
export function findBlockedContent(body: string): string | null {
  for (const [re, what] of BLOCK_PATTERNS) if (re.test(body)) return what;
  if (looksLikePhone(body)) return "phone numbers";
  return null;
}
