import { prisma } from "./prisma";

export async function getUserSlugMap(): Promise<Map<string, string>> {
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
        const first = (u.first_name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        const last = (u.last_name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        
        let baseSlug = `${first}-${last}`.replace(/^-|-$/g, "");
        if (!baseSlug) {
            baseSlug = "user";
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

    return slugMap;
}

export async function getSlugToUserMap(): Promise<Map<string, string>> {
    const slugMap = await getUserSlugMap();
    const reverseMap = new Map<string, string>(); // slug -> userId
    for (const [userId, slug] of slugMap.entries()) {
        reverseMap.set(slug, userId);
    }
    return reverseMap;
}
