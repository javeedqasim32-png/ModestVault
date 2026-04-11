"use server";

import { randomUUID } from "crypto";
import sharp from "sharp";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildS3ImageUrl, getS3BucketName, s3, uploadFile, deleteS3Directory } from "@/lib/s3";
import { isStripeAccountReady } from "@/lib/stripe-connect";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { validateListingTaxonomy } from "@/lib/taxonomyValidation";

const MAX_LISTING_IMAGES = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 18 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function logCreateListingReject(reason: string, details?: Record<string, unknown>) {
    console.error("[createListing] rejected:", reason, details ?? {});
}

function extractImagesFromFormData(formData: FormData) {
    const files = formData
        .getAll("images")
        .filter((item): item is File => item instanceof File && item.size > 0);
    const legacyImage = formData.get("image");

    return files.length > 0
        ? files
        : legacyImage instanceof File && legacyImage.size > 0
            ? [legacyImage]
            : [];
}

function getFileExtension(image: File) {
    const originalName = image.name || "upload";
    const filenameParts = originalName.split(".");
    const extFromName = filenameParts.length > 1 ? filenameParts.pop()?.toLowerCase() : "";
    const extFromMime =
        image.type === "image/jpeg" ? "jpg" :
            image.type === "image/png" ? "png" :
                image.type === "image/webp" ? "webp" :
                    image.type === "image/gif" ? "gif" : "bin";

    return extFromName && /^[a-z0-9]+$/.test(extFromName) ? extFromName : extFromMime;
}

async function uploadImagesForListing({
    listingId,
    images,
    bucket,
}: {
    listingId: string;
    images: File[];
    bucket: string;
}) {
    const uploadedImages: {
        id: string;
        imageUrl: string;
        thumbUrl: string | null;
        mediumUrl: string | null;
        imageOrder: number;
    }[] = [];

    for (const [index, image] of images.entries()) {
        const imageId = randomUUID();
        const ext = getFileExtension(image);
        const key = `listings/${listingId}/${imageId}-original.${ext}`;
        const thumbKey = `listings/${listingId}/${imageId}-thumb.webp`;
        const mediumKey = `listings/${listingId}/${imageId}-medium.webp`;

        const bytes = await image.arrayBuffer();
        const buffer = Buffer.from(bytes);
        let thumbUrl: string | null = null;
        let mediumUrl: string | null = null;

        await uploadFile(buffer, key, image.type || "application/octet-stream", bucket);

        try {
            const thumbBuffer = await sharp(buffer)
                .rotate()
                .resize({ width: 300, withoutEnlargement: true })
                .webp({ quality: 78, effort: 4 })
                .toBuffer();

            await uploadFile(thumbBuffer, thumbKey, "image/webp", bucket);
            thumbUrl = buildS3ImageUrl(thumbKey, bucket);
        } catch (error) {
            console.warn(`Thumb generation/upload failed for listing ${listingId} image ${imageId}:`, error);
        }

        try {
            const mediumBuffer = await sharp(buffer)
                .rotate()
                .resize({ width: 800, withoutEnlargement: true })
                .webp({ quality: 82, effort: 4 })
                .toBuffer();

            await uploadFile(mediumBuffer, mediumKey, "image/webp", bucket);
            mediumUrl = buildS3ImageUrl(mediumKey, bucket);
        } catch (error) {
            console.warn(`Medium generation/upload failed for listing ${listingId} image ${imageId}:`, error);
        }

        uploadedImages.push({
            id: imageId,
            imageUrl: buildS3ImageUrl(key, bucket),
            thumbUrl,
            mediumUrl,
            imageOrder: index + 1,
        });
    }

    return uploadedImages;
}

/**
 * Creates a new product listing.
 */
export async function createListing(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) {
        logCreateListingReject("unauthenticated");
        return { error: "You must be logged in to create a listing." };
    }

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const priceStr = formData.get("price") as string;
    const style = formData.get("style") as string;
    const category = formData.get("category") as string;
    const subcategoryRaw = formData.get("subcategory") as string;
    const typeRaw = formData.get("type") as string;
    const condition = formData.get("condition") as string;
    const brand = formData.get("brand") as string;
    const size = formData.get("size") as string;
    const images = extractImagesFromFormData(formData);

    if (!title || !description || !priceStr || !style || !category || images.length === 0) {
        logCreateListingReject("missing_required_fields", {
            userId: session.user.id,
            hasTitle: Boolean(title),
            hasDescription: Boolean(description),
            hasPrice: Boolean(priceStr),
            hasStyle: Boolean(style),
            hasCategory: Boolean(category),
            imageCount: images.length,
        });
        return { error: "Title, description, price, style, category, and at least one image are required." };
    }

    if (images.length > MAX_LISTING_IMAGES) {
        logCreateListingReject("too_many_images", { userId: session.user.id, imageCount: images.length });
        return { error: "You can upload a maximum of 6 images per listing." };
    }

    const totalImageBytes = images.reduce((total, image) => total + image.size, 0);
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
        logCreateListingReject("total_image_size_too_large", {
            userId: session.user.id,
            totalImageBytes,
            maxBytes: MAX_TOTAL_IMAGE_BYTES,
        });
        return { error: "Total image upload size is too large. Please keep all images under 18MB combined." };
    }

    for (const image of images) {
        if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
            logCreateListingReject("invalid_image_type", {
                userId: session.user.id,
                imageType: image.type,
                imageName: image.name,
            });
            return { error: "Only JPEG, PNG, WEBP, and GIF images are allowed." };
        }
        if (image.size > MAX_IMAGE_BYTES) {
            logCreateListingReject("image_size_too_large", {
                userId: session.user.id,
                imageName: image.name,
                imageSize: image.size,
                maxBytes: MAX_IMAGE_BYTES,
            });
            return { error: "One or more images are larger than 10MB." };
        }
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
        logCreateListingReject("invalid_price", { userId: session.user.id, rawPrice: priceStr });
        return { error: "Please enter a valid price." };
    }

    const taxonomyValidation = validateListingTaxonomy({
        style,
        category,
        subcategory: subcategoryRaw,
        type: typeRaw,
    });
    if (!taxonomyValidation.ok) {
        logCreateListingReject("invalid_taxonomy", {
            userId: session.user.id,
            style,
            category,
            subcategory: subcategoryRaw,
            type: typeRaw,
            message: taxonomyValidation.message,
        });
        return { error: taxonomyValidation.message };
    }

    try {
        // 1. Double check the user is actually a seller
        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user?.stripe_account_id) {
            logCreateListingReject("missing_stripe_account", { userId: session.user.id });
            return { error: "Your seller account is not fully activated with Stripe." };
        }

        const account = await stripe.accounts.retrieve(user.stripe_account_id);
        const isReady = isStripeAccountReady(account);

        if (!isReady) {
            if (user.seller_enabled) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { seller_enabled: false },
                });
            }

            return { error: "Your Stripe account is not ready to accept payouts yet." };
        }

        if (!user.seller_enabled) {
            await prisma.user.update({
                where: { id: user.id },
                data: { seller_enabled: true },
            });
        }

        // 2. Upload image to S3
        const bucket = getS3BucketName();
        if (!bucket) {
            logCreateListingReject("missing_s3_bucket", { userId: session.user.id });
            return { error: "S3 bucket is not configured. Set AWS_S3_BUCKET_NAME." };
        }

        const listingId = randomUUID();
        const listingImages = await uploadImagesForListing({ listingId, images, bucket });

        const coverImage = listingImages[0]?.imageUrl;
        if (!coverImage) {
            logCreateListingReject("no_cover_image", { userId: session.user.id, listingId });
            return { error: "No valid image was uploaded." };
        }

        // 3. Save listing and listing images to database
        await prisma.$transaction(async (tx) => {
            await tx.listing.create({
                data: {
                    id: listingId,
                    user_id: user.id,
                    title,
                    description,
                    price,
                    style: taxonomyValidation.normalized.style,
                    category: taxonomyValidation.normalized.category,
                    subcategory: taxonomyValidation.normalized.subcategory,
                    type: taxonomyValidation.normalized.type,
                    condition: condition || null,
                    brand: brand || null,
                    size: size || null,
                    image_url: coverImage,
                    status: "AVAILABLE",
                    moderation_status: "PENDING",
                }
            });

            await tx.listingImage.createMany({
                data: listingImages.map((img) => ({
                    id: img.id,
                    listingId,
                    imageUrl: img.imageUrl,
                    thumbUrl: img.thumbUrl,
                    mediumUrl: img.mediumUrl,
                    imageOrder: img.imageOrder,
                })),
            });
        });

    } catch (error) {
        console.error("Create listing error:", {
            userId: session.user.id,
            message: error instanceof Error ? error.message : String(error),
            error,
        });
        return { error: "An unexpected error occurred while creating the listing." };
    }

    // Return success to the client instead of redirecting because redirect throws an error
    return { success: true };
}

export async function updateListing(listingId: string, formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "You must be logged in to update a listing." };
    }

    if (!listingId) {
        return { error: "Listing ID is required." };
    }

    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true, user_id: true, status: true },
    });

    if (!listing || listing.user_id !== session.user.id) {
        return { error: "Listing not found or you do not have permission to edit it." };
    }
    if (listing.status === "SOLD") {
        return { error: "Sold listings cannot be edited." };
    }

    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const priceStr = String(formData.get("price") || "").trim();
    const style = String(formData.get("style") || "").trim();
    const category = String(formData.get("category") || "").trim();
    const subcategoryRaw = String(formData.get("subcategory") || "").trim();
    const typeRaw = String(formData.get("type") || "").trim();
    const condition = String(formData.get("condition") || "").trim();
    const brand = String(formData.get("brand") || "").trim();
    const size = String(formData.get("size") || "").trim();

    if (!title || !description || !priceStr || !style || !category) {
        return { error: "Title, description, price, style, and category are required." };
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
        return { error: "Please enter a valid price." };
    }

    const taxonomyValidation = validateListingTaxonomy({
        style,
        category,
        subcategory: subcategoryRaw,
        type: typeRaw,
    });
    if (!taxonomyValidation.ok) {
        return { error: taxonomyValidation.message };
    }

    try {
        await prisma.listing.update({
            where: { id: listingId },
            data: {
                title,
                description,
                price,
                style: taxonomyValidation.normalized.style,
                category: taxonomyValidation.normalized.category,
                subcategory: taxonomyValidation.normalized.subcategory,
                type: taxonomyValidation.normalized.type,
                condition: condition || null,
                brand: brand || null,
                size: size || null,
                moderation_status: "PENDING",
            },
        });

        revalidatePath("/sell");
        revalidatePath("/browse");
        revalidatePath(`/listings/${listingId}`);
        revalidatePath(`/sellers/${session.user.id}`);
        return { success: true };
    } catch (error) {
        console.error("Update listing error:", error);
        return { error: "An unexpected error occurred while updating the listing." };
    }
}

/**
 * Replaces a listing's images while keeping strict listing ownership.
 * Images are ordered by upload sequence and the first image becomes cover.
 */
export async function replaceListingImages(listingId: string, formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "You must be logged in to edit listing images." };
    }

    if (!listingId) {
        return { error: "Listing ID is required." };
    }

    const images = extractImagesFromFormData(formData);
    if (images.length === 0) {
        return { error: "At least one image is required." };
    }
    if (images.length > MAX_LISTING_IMAGES) {
        return { error: "You can upload a maximum of 6 images per listing." };
    }
    const totalImageBytes = images.reduce((total, image) => total + image.size, 0);
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
        return { error: "Total image upload size is too large. Please keep all images under 18MB combined." };
    }
    for (const image of images) {
        if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
            return { error: "Only JPEG, PNG, WEBP, and GIF images are allowed." };
        }
        if (image.size > MAX_IMAGE_BYTES) {
            return { error: "One or more images are larger than 10MB." };
        }
    }

    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true, user_id: true },
    });

    if (!listing || listing.user_id !== session.user.id) {
        return { error: "Listing not found or you do not have permission to edit it." };
    }

    const bucket = getS3BucketName();
    if (!bucket) {
        return { error: "S3 bucket is not configured. Set AWS_S3_BUCKET_NAME." };
    }

    try {
        const uploadedImages = await uploadImagesForListing({ listingId, images, bucket });
        const coverImage = uploadedImages[0]?.imageUrl;
        if (!coverImage) {
            return { error: "No valid image was uploaded." };
        }

        await prisma.$transaction(async (tx) => {
            await tx.listingImage.deleteMany({ where: { listingId } });
            await tx.listingImage.createMany({
                data: uploadedImages.map((image) => ({
                    id: image.id,
                    listingId,
                    imageUrl: image.imageUrl,
                    thumbUrl: image.thumbUrl,
                    mediumUrl: image.mediumUrl,
                    imageOrder: image.imageOrder,
                })),
            });
            await tx.listing.update({
                where: { id: listingId },
                data: { image_url: coverImage },
            });
        });

        return { success: true };
    } catch (error) {
        console.error("Replace listing images error:", error);
        return { error: "An unexpected error occurred while updating listing images." };
    }
}

export async function deleteListing(listingId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "You must be logged in to delete a listing." };
    }

    if (!listingId) {
        return { error: "Listing ID is required." };
    }

    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true, user_id: true },
    });

    if (!listing || listing.user_id !== session.user.id) {
        return { error: "Listing not found or you do not have permission to delete it." };
    }

    const purchasesCount = await prisma.purchase.count({
        where: { listing_id: listingId },
    });
    if (purchasesCount > 0) {
        return { error: "This listing cannot be deleted because it already has purchases." };
    }

    const bucket = getS3BucketName();
    if (!bucket) {
        return { error: "S3 bucket is not configured. Set AWS_S3_BUCKET_NAME." };
    }

    const prefix = `listings/${listingId}/`;

    try {
        try {
            await deleteS3Directory(prefix, bucket);
        } catch (s3Error) {
            console.error("Failed to delete images from S3 for listing:", listingId, s3Error);
            // Non-fatal, proceed with database deletion so the user isn't blocked
        }

        // Best-effort cart cleanup. If cart model/table is unavailable in a running env,
        // do not block listing deletion.
        try {
            const cartDelegate = (prisma as unknown as {
                cartItem?: { deleteMany: (args: unknown) => Promise<unknown> };
            }).cartItem;
            if (cartDelegate) {
                await cartDelegate.deleteMany({
                    where: { listing_id: listingId },
                });
            }
        } catch (cartDeleteError) {
            console.error("Cart cleanup skipped for listing:", listingId, cartDeleteError);
        }

        await prisma.$transaction(async (tx) => {
            // Explicitly delete related listing images; listing delete removes the listing itself.
            await tx.listingImage.deleteMany({
                where: { listingId: listingId },
            });
            await tx.listing.delete({
                where: { id: listingId },
            });
        });

        revalidatePath("/sell");
        revalidatePath("/browse");
        revalidatePath("/dashboard/listings");

        return { success: true };
    } catch (error) {
        console.error("Delete listing error:", error);
        return { error: "An unexpected error occurred while deleting the listing." };
    }
}
