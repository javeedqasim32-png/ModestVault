"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function toggleFollowUser(targetUserId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Please sign in to follow sellers." };
  }

  const followerId = session.user.id;
  if (followerId === targetUserId) {
    return { error: "You cannot follow yourself." };
  }

  try {
    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true }
    });

    if (!targetUser) {
      return { error: "User not found." };
    }

    const existingFollow = await prisma.follow.findUnique({
      where: {
        follower_id_following_id: {
          follower_id: followerId,
          following_id: targetUserId,
        },
      },
    });

    let followed = false;
    if (existingFollow) {
      // Unfollow
      await prisma.follow.delete({
        where: {
          id: existingFollow.id,
        },
      });
    } else {
      // Follow
      await prisma.follow.create({
        data: {
          follower_id: followerId,
          following_id: targetUserId,
        },
      });
      followed = true;
    }

    // Revalidate target user's profile path
    revalidatePath(`/${targetUserId}`);
    return { success: true, followed };
  } catch (error: any) {
    console.error("toggleFollowUser error:", error);
    return { error: `Failed to toggle follow: ${error?.message || "Unknown error"}` };
  }
}

export async function checkIsFollowing(targetUserId: string) {
  const session = await auth();
  if (!session?.user?.id) return false;

  try {
    const follow = await prisma.follow.findUnique({
      where: {
        follower_id_following_id: {
          follower_id: session.user.id,
          following_id: targetUserId,
        },
      },
    });
    return !!follow;
  } catch (error) {
    console.error("checkIsFollowing error:", error);
    return false;
  }
}

export async function getFollowCounts(userId: string) {
  try {
    const [followersCount, followingCount] = await Promise.all([
      prisma.follow.count({
        where: { following_id: userId },
      }),
      prisma.follow.count({
        where: { follower_id: userId },
      }),
    ]);

    return { followersCount, followingCount };
  } catch (error) {
    console.error("getFollowCounts error:", error);
    return { followersCount: 0, followingCount: 0 };
  }
}
