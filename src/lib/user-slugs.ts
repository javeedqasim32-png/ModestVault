import { prisma } from "./prisma";

// Global cache variables to persist between requests in Node.js server memory
let cachedSlugMap: Map<string, string> | null = null;
let cachedReverseMap: Map<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 10000; // Cache duration (10 seconds) for real-time freshness with database safety

const RESERVED = new Set([
  "api", "_next", "sell", "browse", "dashboard", "listings",
  "messages", "admin", "login", "signup", "logout", "favicon",
  "policies", "support", "settings", "sellers"
]);

export async function getUserSlugMap(): Promise<Map<string, string>> {
    const now = Date.now();
    
    // Serve from cache instantly if valid
    if (cachedSlugMap && (now - cacheTimestamp < CACHE_DURATION_MS)) {
        return cachedSlugMap;
    }

    const users = await prisma.user.findMany({
        select: {
            id: true,
            first_name: true,
            last_name: true,
            created_at: true,
        },
        orderBy: [
            { created_at: "asc" },
            { id: "asc" }
        ]
    });

    const slugMap = new Map<string, string>(); // userId -> slug
    const slugCounts = new Map<string, number>(); // baseSlug -> count

    for (const u of users) {
        const cap = (s: string) => {
            const cleaned = s.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
            if (!cleaned) return "";
            return cleaned.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("-");
        };

        const first = cap(u.first_name || "");
        const last = cap(u.last_name || "");
        
        let baseSlug = `${first}-${last}`.replace(/^-|-$/g, "");
        if (!baseSlug) {
            baseSlug = "User";
        }

        if (RESERVED.has(baseSlug.toLowerCase())) {
            baseSlug = `${baseSlug}-1`;
        }

        const currentCount = slugCounts.get(baseSlug) || 0;
        if (currentCount === 0) {
            slugMap.set(u.id, baseSlug);
            slugCounts.set(baseSlug, 1);
        } else {
            const newSlug = `${baseSlug}-${currentCount}`;
            slugMap.set(u.id, newSlug);
            slugCounts.set(baseSlug, currentCount + 1);
        }
    }

    // Update caches
    cachedSlugMap = slugMap;
    cacheTimestamp = now;
    cachedReverseMap = null; // Clear reverse map to force recalculation

    return slugMap;
}

export async function getSlugToUserMap(): Promise<Map<string, string>> {
    if (cachedReverseMap) {
        return cachedReverseMap;
    }

    const slugMap = await getUserSlugMap();
    const reverseMap = new Map<string, string>(); // slug.toLowerCase() -> userId
    for (const [userId, slug] of slugMap.entries()) {
        reverseMap.set(slug.toLowerCase(), userId);
    }
    
    cachedReverseMap = reverseMap;
    return reverseMap;
}
