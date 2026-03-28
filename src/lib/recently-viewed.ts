const RECENTLY_VIEWED_COOKIE_PREFIX = "mv_recently_viewed_";
const FALLBACK_VIEWER_KEY = "guest";
const LISTING_ID_PATTERN = /^[a-zA-Z0-9-]{8,}$/;

export function getRecentlyViewedCookieName(viewerId?: string | null) {
  return `${RECENTLY_VIEWED_COOKIE_PREFIX}${viewerId || FALLBACK_VIEWER_KEY}`;
}

export function parseRecentlyViewedCookie(rawValue?: string | null) {
  if (!rawValue) return [];

  const ids = rawValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => LISTING_ID_PATTERN.test(part));

  // Preserve order while removing duplicates.
  return Array.from(new Set(ids));
}

export function serializeRecentlyViewed(ids: string[]) {
  return ids.join(",");
}
