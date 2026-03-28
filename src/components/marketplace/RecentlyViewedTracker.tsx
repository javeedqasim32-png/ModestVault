"use client";

import { useEffect } from "react";
import { getRecentlyViewedCookieName, parseRecentlyViewedCookie, serializeRecentlyViewed } from "@/lib/recently-viewed";

const MAX_RECENTLY_VIEWED = 12;

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const escapedName = name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function RecentlyViewedTracker({
  listingId,
  viewerId,
}: {
  listingId: string;
  viewerId?: string | null;
}) {
  useEffect(() => {
    if (!listingId) return;

    const cookieName = getRecentlyViewedCookieName(viewerId);
    const current = parseRecentlyViewedCookie(readCookie(cookieName));
    const next = [listingId, ...current.filter((id) => id !== listingId)].slice(0, MAX_RECENTLY_VIEWED);

    document.cookie = `${cookieName}=${encodeURIComponent(serializeRecentlyViewed(next))}; Path=/; Max-Age=2592000; SameSite=Lax`;
  }, [listingId, viewerId]);

  return null;
}
