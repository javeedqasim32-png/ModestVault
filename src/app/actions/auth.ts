"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "@/lib/email";
import { hasCarrierPhoneLength, normalizeUsPhoneInput } from "@/lib/phone";

// Helper to generate a 6 digit code
function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Step 1: Start the signup process
 * Validates inputs, checks for existing active users, creates/updates PendingUser, and sends email.
 */
export async function startSignup(formData: FormData) {
    console.log("🚀 START_SIGNUP ACTION CALLED AT:", new Date().toISOString());
    const firstName = ((formData.get("first_name") as string) || "").trim();
    const lastName = ((formData.get("last_name") as string) || "").trim();
    let email = ((formData.get("email") as string) || "").trim();
    const password = ((formData.get("password") as string) || "").trim();
    const rawPhone = ((formData.get("phone") as string) || "").trim();
    const street1 = formData.get("street1") as string;
    const street2 = formData.get("street2") as string;
    const city = formData.get("city") as string;
    const state = formData.get("state") as string;
    const zip = formData.get("zip") as string;
    const country = formData.get("country") as string;

    const missingFields: string[] = [];
    if (!firstName) missingFields.push("First name");
    if (!lastName) missingFields.push("Last name");
    if (!email) missingFields.push("Email");
    if (!password) missingFields.push("Password");
    if (!rawPhone) missingFields.push("Phone number");

    if (missingFields.length > 0) {
        return { error: `Missing required field${missingFields.length > 1 ? "s" : ""}: ${missingFields.join(", ")}.` };
    }

    email = email.toLowerCase().trim();
    const phone = normalizeUsPhoneInput(rawPhone);
    if (!hasCarrierPhoneLength(phone)) {
        return { error: "Phone number must contain between 8 and 15 digits." };
    }

    try {
        // 1. Check if user already exists in main User table
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return { error: "An account with this email already exists." };
        }

        // 2. Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 3. Generate verification code & hash it
        const rawCode = generateVerificationCode();
        const codeSalt = await bcrypt.genSalt(10);
        const verification_code_hash = await bcrypt.hash(rawCode, codeSalt);

        // 4. Set expiry (10 minutes)
        const code_expiry = new Date(Date.now() + 10 * 60 * 1000);

        // 5. Upsert PendingUser
        const existingPending = await prisma.pendingUser.findUnique({
            where: { email }
        });

        if (existingPending) {
            await prisma.pendingUser.update({
                where: { email },
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    password_hash,
                    phone,
                    street1,
                    street2,
                    city,
                    state,
                    zip,
                    country,
                    verification_code_hash,
                    code_expiry,
                    attempt_count: 0,
                    resend_count: existingPending.resend_count + 1,
                    last_sent_at: new Date()
                }
            });
        } else {
            await prisma.pendingUser.create({
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    email,
                    password_hash,
                    phone,
                    street1,
                    street2,
                    city,
                    state,
                    zip,
                    country,
                    verification_code_hash,
                    code_expiry,
                    last_sent_at: new Date()
                }
            });
        }

        // 6. Send the code
        await sendVerificationEmail(email, rawCode);

        // Return success so frontend can swap to verification state
        return { success: true, email };

    } catch (error: any) {
        console.error("❌ SIGNUP_ERROR_DETAILS:", {
            message: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name
        });
        return { error: `Something went wrong: ${error.message || "Unknown error"}` };
    }
}

/**
 * Step 2: Verify the code
 * Checks code against hash, creates User if valid, removes PendingUser.
 */
export async function verifyEmail(email: string, code: string) {
    if (!email || !code) return { error: "Missing email or code." };
    email = email.toLowerCase().trim();

    try {
        const pendingUser = await prisma.pendingUser.findUnique({
            where: { email }
        });

        if (!pendingUser) {
            return { error: "Signup session not found or expired." };
        }

        if (pendingUser.attempt_count >= 5) {
            return { error: "Too many failed attempts. Please request a new code." };
        }

        if (new Date() > pendingUser.code_expiry) {
            return { error: "Verification code has expired. Please request a new one." };
        }

        // Compare the code
        const isCodeValid = await bcrypt.compare(code, pendingUser.verification_code_hash);

        if (!isCodeValid) {
            await prisma.pendingUser.update({
                where: { email },
                data: { attempt_count: pendingUser.attempt_count + 1 }
            });
            return { error: "Invalid verification code." };
        }

        // Success: Create User, delete PendingUser
        // Execute in transaction for safety
        await prisma.$transaction(async (tx: any) => {
            // Re-check User doesn't exist
            const existing = await tx.user.findUnique({ where: { email } });
            if (existing) throw new Error("USER_EXISTS");

            await tx.user.create({
                data: {
                    first_name: pendingUser.first_name,
                    last_name: pendingUser.last_name,
                    email: pendingUser.email,
                    password_hash: pendingUser.password_hash,
                    phone: pendingUser.phone,
                    street1: pendingUser.street1,
                    street2: pendingUser.street2,
                    city: pendingUser.city,
                    state: pendingUser.state,
                    zip: pendingUser.zip,
                    country: pendingUser.country,
                    email_verified: true,
                }
            });

            await tx.pendingUser.delete({
                where: { email }
            });
        });

        return { success: true };

    } catch (error) {
        console.error("Verification error:", error);
        if (error instanceof Error && error.message === "USER_EXISTS") {
            return { error: "Account already exists." };
        }
        return { error: "Something went wrong during verification." };
    }
}

/**
 * Step 3: Resend code
 * Generates a new code, limits abuse, resends email.
 */
export async function resendCode(email: string) {
    if (!email) return { error: "Email is required." };
    email = email.toLowerCase().trim();

    try {
        const pendingUser = await prisma.pendingUser.findUnique({
            where: { email }
        });

        if (!pendingUser) {
            return { error: "Signup session not found." };
        }

        // Optional cooldown: Check if last_sent_at is within the last 30 seconds
        if (pendingUser.last_sent_at) {
            const timeSinceLastSent = Date.now() - pendingUser.last_sent_at.getTime();
            if (timeSinceLastSent < 30 * 1000) {
                return { error: "Please wait a moment before requesting a new code." };
            }
        }

        // Generate new code
        const rawCode = generateVerificationCode();
        const codeSalt = await bcrypt.genSalt(10);
        const verification_code_hash = await bcrypt.hash(rawCode, codeSalt);
        const code_expiry = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.pendingUser.update({
            where: { email },
            data: {
                verification_code_hash,
                code_expiry,
                attempt_count: 0,
                resend_count: pendingUser.resend_count + 1,
                last_sent_at: new Date()
            }
        });

        await sendVerificationEmail(email, rawCode);

        return { success: true, message: "A new code has been sent." };

    } catch (error) {
        console.error("Resend error:", error);
        return { error: "Something went wrong while sending a new code." };
    }
}

/**
 * Step 4: Get User Profile
 */
export async function getUserProfile(userId: string) {
    if (!userId) return { error: "User ID is required." };
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        return { success: true, user };
    } catch (error) {
        return { error: "Failed to fetch profile." };
    }
}

/**
 * Step 5: Update User Profile
 */
export async function updateUserProfile(userId: string, data: any) {
    if (!userId) return { error: "User ID is required." };

    try {
        const normalizedPhone = normalizeUsPhoneInput(data.phone || "");
        if (!hasCarrierPhoneLength(normalizedPhone)) {
            return { error: "Phone number must contain between 8 and 15 digits." };
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                first_name: data.first_name,
                last_name: data.last_name,
                phone: normalizedPhone,
                street1: data.street1,
                street2: data.street2,
                city: data.city,
                state: data.state,
                zip: data.zip,
                country: data.country
            }
        });
        return { success: true };
    } catch (error) {
        console.error("Profile update error:", error);
        return { error: "Failed to update profile." };
    }
}
