"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { setFavoriteForListing } from "@/app/actions/favorites";

export default function FavoriteButton({
  listingId,
  initialFavorited = false,
  className = "",
}: {
  listingId: string;
  initialFavorited?: boolean;
  className?: string;
}) {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
      disabled={isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = !isFavorited;
        setIsFavorited(next);
        startTransition(async () => {
          const res = await setFavoriteForListing(listingId, next);
          if (res?.error) {
            setIsFavorited(!next);
            if (res.error.includes("sign in")) {
              const callback = encodeURIComponent(window.location.pathname + window.location.search);
              window.location.href = `/login?callbackUrl=${callback}`;
            }
          }
        });
      }}
      className={className}
    >
      <Heart
        className={`h-5 w-5 transition-colors ${
          isFavorited ? "fill-foreground text-foreground" : "text-foreground/70"
        }`}
      />
    </button>
  );
}
