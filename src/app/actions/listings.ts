"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Activates seller status for the current user.
 */
export async function activateSellerStatus() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "You must be logged in to activate your seller account." };
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { seller_enabled: true },
        });
        return { success: true };
    } catch (error) {
        console.error("Seller activation error:", error);
        return { error: "Failed to activate seller account." };
    }
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
    const image = formData.get("image") as File;

    if (!title || !description || !priceStr || !category || !image || image.size === 0) {
        return { error: "Title, description, price, category, and an image are required." };
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

        if (!user?.seller_enabled || !user?.stripe_account_id) {
            return { error: "Your seller account is not fully activated with Stripe." };
        }

        // 2. Handle Image Upload (saving to public/uploads mock)
        const bytes = await image.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Ensure the directory exists
        const uploadDir = join(process.cwd(), "public/uploads");
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true });
        }

        const uniqueSuffix = Date.now() + Math.round(Math.random() * 1E9);
        const fileName = `${uniqueSuffix}-${image.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const filePath = join(uploadDir, fileName);

        await writeFile(filePath, buffer);
        const image_url = `/uploads/${fileName}`;

        // 3. Save listing to database
        const newListing = await prisma.listing.create({
            data: {
                user_id: user.id,
                title,
                description,
                price,
                category,
                condition: condition || null,
                brand: brand || null,
                size: size || null,
                image_url,
                status: "AVAILABLE",
            }
        });

    } catch (error) {
        console.error("Create listing error:", error);
        return { error: "An unexpected error occurred while creating the listing." };
    }

    // Redirect upon successful creation to the dashboard
    redirect("/dashboard/listings");
}
