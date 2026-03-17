type ListingImageRecord = {
  imageUrl?: string | null;
  thumbUrl?: string | null;
  mediumUrl?: string | null;
  imageOrder?: number | null;
};

type ListingWithImages = {
  image_url?: string | null;
  images?: ListingImageRecord[] | null;
};

type ListingImageSurface = "card" | "detail" | "original";

function pickFromImage(
  image: ListingImageRecord | undefined,
  surface: ListingImageSurface
) {
  if (!image) return null;

  if (surface === "card") {
    return image.thumbUrl ?? image.mediumUrl ?? image.imageUrl ?? null;
  }

  if (surface === "detail") {
    return image.mediumUrl ?? image.imageUrl ?? image.thumbUrl ?? null;
  }

  return image.imageUrl ?? image.mediumUrl ?? image.thumbUrl ?? null;
}

export function getPrimaryListingImage(
  listing: ListingWithImages,
  surface: ListingImageSurface
) {
  const first = listing.images?.[0];
  return pickFromImage(first, surface) ?? listing.image_url ?? "";
}

export function getOrderedListingGallery(listing: ListingWithImages) {
  if (!listing.images || listing.images.length === 0) {
    return listing.image_url
      ? [
          {
            originalUrl: listing.image_url,
            mediumUrl: listing.image_url,
            thumbUrl: listing.image_url,
          },
        ]
      : [];
  }

  return listing.images
    .map((image) => ({
      originalUrl: pickFromImage(image, "original") ?? "",
      mediumUrl: pickFromImage(image, "detail") ?? "",
      thumbUrl: pickFromImage(image, "card") ?? "",
    }))
    .filter((image) => image.originalUrl || image.mediumUrl || image.thumbUrl);
}
