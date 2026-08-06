import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { requireBearer } from "@/lib/api/bearer-auth";
import { getSlugToUserMap } from "@/lib/user-slugs";

export const dynamic = "force-dynamic";

const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSellerId(rawId: string): Promise<string | null> {
    const slugMap = await getSlugToUserMap();
    return slugMap.get(rawId.toLowerCase()) || (uuidRegex.test(rawId) ? rawId : null);
}

/** POST /api/v1/sellers/[id]/follow — idempotent, returns followers count. */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in to follow sellers.");

    const { id } = await params;
    const sellerId = await resolveSellerId(id);
    if (!sellerId) return apiError("NOT_FOUND", "Seller not found.");

    if (sellerId === principal.id) {
        return apiError("INVALID_INPUT", "You cannot follow yourself.");
    }

    await prisma.follow.upsert({
        where: {
            follower_id_following_id: {
                follower_id: principal.id,
                following_id: sellerId,
            },
        },
        create: { follower_id: principal.id, following_id: sellerId },
        update: {},
    });

    const followers = await prisma.follow.count({ where: { following_id: sellerId } });
    return NextResponse.json({ isFollowing: true, followers });
}

/** DELETE /api/v1/sellers/[id]/follow — idempotent unfollow. */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const principal = await requireBearer(req);
    if (!principal) return apiError("UNAUTHORIZED", "Sign in to unfollow sellers.");

    const { id } = await params;
    const sellerId = await resolveSellerId(id);
    if (!sellerId) return apiError("NOT_FOUND", "Seller not found.");

    await prisma.follow.deleteMany({
        where: { follower_id: principal.id, following_id: sellerId },
    });

    const followers = await prisma.follow.count({ where: { following_id: sellerId } });
    return NextResponse.json({ isFollowing: false, followers });
}
