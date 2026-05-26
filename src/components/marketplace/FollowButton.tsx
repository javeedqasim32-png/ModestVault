"use client";

import { useState, useTransition } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { toggleFollowUser } from "@/app/actions/follows";

export default function FollowButton({
  targetUserId,
  initialIsFollowing = false,
}: {
  targetUserId: string;
  initialIsFollowing?: boolean;
}) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, startTransition] = useTransition();

  const handleFollowClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    const nextState = !isFollowing;
    setIsFollowing(nextState);

    startTransition(async () => {
      const res = await toggleFollowUser(targetUserId);
      if (res?.error) {
        // Rollback state on failure
        setIsFollowing(!nextState);
        if (res.error.includes("sign in")) {
          const callback = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?callbackUrl=${callback}`;
        } else {
          alert(res.error);
        }
      }
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleFollowClick}
      className={`inline-flex min-h-[42px] min-w-[130px] items-center justify-center gap-2 rounded-full border transition-all text-[13px] font-medium shadow-sm hover:scale-[1.02] active:scale-[0.98] ${
        isFollowing
          ? "border-[#4a3328] bg-[#4a3328] text-white hover:bg-[#5c4234]"
          : "border-[#ddd3cb] bg-[#fbf8f5] text-[#2f2925] hover:bg-[#ede7df]"
      }`}
    >
      {isFollowing ? (
        <>
          <UserCheck className="h-4 w-4 shrink-0" />
          <span>Following</span>
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4 shrink-0" />
          <span>Follow</span>
        </>
      )}
    </button>
  );
}
