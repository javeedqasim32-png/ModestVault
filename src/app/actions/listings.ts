"use server";

import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildS3ImageUrl, getS3BucketName, s3 } from "@/lib/s3";
import { isStripeAccountReady } from "@/lib/stripe-connect";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const MAX_LISTING_IMAGES = 6;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: image.type || "application/octet-stream",
                CacheControl: "public, max-age=31536000, immutable",
            })
        );

        try {
            const thumbBuffer = await sharp(buffer)
                .rotate()
                .resize({ width: 300, withoutEnlargement: true })
                .webp({ quality: 78, effort: 4 })
                .toBuffer();

            await s3.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: thumbKey,
                    Body: thumbBuffer,
                    ContentType: "image/webp",
                    CacheControl: "public, max-age=31536000, immutable",
                })
            );
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

            await s3.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: mediumKey,
                    Body: mediumBuffer,
                    ContentType: "image/webp",
                    CacheControl: "public, max-age=31536000, immutable",
                })
            );
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
        return { error: "You must be logged in to create a listing." };
    }

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const priceStr = formData.get("price") as string;
    const category = formData.get("category") as string;
    const condition = formData.get("condition") as string;
    const brand = formData.get("brand") as string;
    const size = formData.get("size") as string;
    const images = extractImagesFromFormData(formData);

    if (!title || !description || !priceStr || !category || images.length === 0) {
        return { error: "Title, description, price, category, and at least one image are required." };
    }

    if (images.length > MAX_LISTING_IMAGES) {
        return { error: "You can upload a maximum of 6 images per listing." };
    }

    for (const image of images) {
        if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
            return { error: "Only JPEG, PNG, WEBP, and GIF images are allowed." };
        }
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
        return { error: "Please enter a valid price." };
    }

    try {
        // 1. Double check the user is actually a seller
        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user?.stripe_account_id) {
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
            return { error: "S3 bucket is not configured. Set AWS_S3_BUCKET_NAME." };
        }

        const listingId = randomUUID();
        const listingImages = await uploadImagesForListing({ listingId, images, bucket });

        const coverImage = listingImages[0]?.imageUrl;
        if (!coverImage) {
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
                    category,
                    condition: condition || null,
                    brand: brand || null,
                    size: size || null,
                    image_url: coverImage,
                    status: "AVAILABLE",
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
        console.error("Create listing error:", error);
        return { error: "An unexpected error occurred while creating the listing." };
    }

    // Redirect upon successful creation to the sell page
    redirect("/sell");
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
    for (const image of images) {
        if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
            return { error: "Only JPEG, PNG, WEBP, and GIF images are allowed." };
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
        let continuationToken: string | undefined;
        try {
            do {
                const listed = await s3.send(
                    new ListObjectsV2Command({
                        Bucket: bucket,
                        Prefix: prefix,
                        ContinuationToken: continuationToken,
                    })
                );

                const keys = (listed.Contents ?? [])
                    .map((obj) => obj.Key)
                    .filter((key): key is string => Boolean(key));

                if (keys.length > 0) {
                    await s3.send(
                        new DeleteObjectsCommand({
                            Bucket: bucket,
                            Delete: {
                                Objects: keys.map((key) => ({ Key: key })),
                                Quiet: true,
                            },
                        })
                    );
                }

                continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
            } while (continuationToken);
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
