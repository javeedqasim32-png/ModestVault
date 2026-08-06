import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api/errors";
import { getSlugToUserMap } from "@/lib/user-slugs";
import { serializeListingSummaryForMobile } from "@/lib/api/mobile-serializers";
import { requireBearer } from "@/lib/api/bearer-auth";

export const dynamic = "force-dynamic";

const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/sellers/[id]
 *
 * Public seller profile. Accepts either a UUID or a vanity slug
 * (matches the website's /[id] route). Returns header stats
 * (sales/followers/rating), the seller's live listings, and the
 * most recent reviews.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const slugMap = await getSlugToUserMap();
    const userId =
        slugMap.get(id.toLowerCase()) || (uuidRegex.test(id) ? id : null);
    if (!userId) return apiError("NOT_FOUND", "Seller not found.");

    // Optional auth — endpoint is public, but signed-in viewers get
    // isOwnProfile + isFollowing so the client can render Edit vs Follow.
    const principal = await requireBearer(req);

    const seller = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            first_name: true,
            last_name: true,
            profile_image: true,
            created_at: true,
            listings: {
                where: {
                    moderation_status: { in: ["APPROVED", "PARTIAL_APPROVED"] },
                },
                orderBy: { created_at: "desc" },
                include: {
                    images: {
                        orderBy: { imageOrder: "asc" },
                        take: 1,
                        select: {
                            imageUrl: true,
                            thumbUrl: true,
                            mediumUrl: true,
                            imageOrder: true,
                        },
                    },
                },
            },
            reviewsReceived: {
                orderBy: { created_at: "desc" },
                take: 10,
                select: {
                    id: true,
                    rating: true,
                    text: true,
                    created_at: true,
                    reviewer: {
                        select: { first_name: true, last_name: true },
                    },
                },
            },
        },
    });

    if (!seller) return apiError("NOT_FOUND", "Seller not found.");

    const [followersCount, allReviewCount, followRow] = await Promise.all([
        prisma.follow.count({ where: { following_id: seller.id } }),
        prisma.sellerReview.count({ where: { seller_id: seller.id } }),
        principal && principal.id !== seller.id
            ? prisma.follow.findUnique({
                  where: {
                      follower_id_following_id: {
                          follower_id: principal.id,
                          following_id: seller.id,
                      },
                  },
                  select: { id: true },
              })
            : Promise.resolve(null),
    ]);
    const salesCount = seller.listings.filter((l) => l.status === "SOLD")
        .length;
    const liveListings = seller.listings.filter(
        (l) => l.status === "AVAILABLE",
    );

    const ratingAvg = seller.reviewsReceived.length
        ? Number(
              (
                  seller.reviewsReceived.reduce((s, r) => s + r.rating, 0) /
                  seller.reviewsReceived.length
              ).toFixed(1),
          )
        : 0;

    return NextResponse.json({
        id: seller.id,
        firstName: seller.first_name,
        lastName: seller.last_name,
        profileImage: seller.profile_image,
        memberSinceLabel: `Member since ${seller.created_at.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
        isOwnProfile: principal?.id === seller.id,
        isFollowing: followRow !== null,
        stats: {
            sales: salesCount,
            followers: followersCount,
            rating: ratingAvg,
            reviewCount: allReviewCount,
        },
        listings: liveListings.map(serializeListingSummaryForMobile),
        reviews: seller.reviewsReceived.map((r) => ({
            id: r.id,
            rating: r.rating,
            text: r.text,
            dateLabel: r.created_at.toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
            }),
            reviewerName: `${r.reviewer.first_name} ${
                r.reviewer.last_name?.[0]
                    ? `${r.reviewer.last_name[0].toUpperCase()}.`
                    : ""
            }`.trim(),
        })),
    });
}
