"use client";

import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Heart } from "lucide-react";
import { setFavoriteForListing } from "@/app/actions/favorites";
import SignInPromptModal from "@/components/auth/SignInPromptModal";
import { trackMetaEvent } from "@/lib/meta-pixel";

export default function FavoriteButton({
  listingId,
  initialFavorited = false,
  className = "",
  iconClassName = "",
  label,
  labelClassName = "",
}: {
  listingId: string;
  initialFavorited?: boolean;
  className?: string;
  iconClassName?: string;
  label?: string;
  labelClassName?: string;
}) {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();
  const [promptOpen, setPromptOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build the post-login bounce target. usePathname / useSearchParams resolve
  // on the client so this naturally reflects whichever page the heart was
  // tapped on (browse, listing detail, profile, etc.).
  const search = searchParams?.toString();
  const callbackUrl = pathname + (search ? `?${search}` : "");

  return (
    <>
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
                setPromptOpen(true);
              }
            } else if (next) {
              // Only fire on unfavorited → favorited transition — not on
              // un-favorite. Meta's AddToWishlist event has no "remove"
              // counterpart.
              trackMetaEvent("AddToWishlist", {
                content_ids: [listingId],
                content_type: "product",
              });
            }
          });
        }}
        className={className}
      >
        <Heart
          className={`${iconClassName || "h-5 w-5"} transition-colors ${
            isFavorited ? "fill-foreground text-foreground" : "text-foreground/70"
          }`}
        />
        {label ? <span className={labelClassName}>{label}</span> : null}
      </button>
      <SignInPromptModal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        intent="favorite"
        callbackUrl={callbackUrl}
      />
    </>
  );
}
