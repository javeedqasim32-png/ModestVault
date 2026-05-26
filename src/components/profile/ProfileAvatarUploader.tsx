"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { updateUserProfilePicture } from "@/app/actions/auth";

interface ProfileAvatarUploaderProps {
    sellerId: string;
    initials: string;
    isOwnProfile: boolean;
    initialProfileImage: string | null;
}

export default function ProfileAvatarUploader({
    sellerId,
    initials,
    isOwnProfile,
    initialProfileImage,
}: ProfileAvatarUploaderProps) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [profileImage, setProfileImage] = useState<string | null>(initialProfileImage);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAvatarClick = () => {
        if (!isOwnProfile || isUploading) return;
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation
        if (!file.type.startsWith("image/")) {
            setError("Please select a valid image file.");
            return;
        }

        // Limit size to 5MB
        if (file.size > 5 * 1024 * 1024) {
            setError("Image size must be less than 5MB.");
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64 = reader.result as string;
                    const res = await updateUserProfilePicture(sellerId, base64, file.type);
                    if (res.error) {
                        setError(res.error);
                    } else if (res.imageUrl) {
                        setProfileImage(res.imageUrl);
                        router.refresh();
                    }
                } catch (err: any) {
                    setError(err.message || "Failed to upload image.");
                } finally {
                    setIsUploading(false);
                }
            };
            reader.onerror = () => {
                setError("Failed to read the file.");
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (err: any) {
            setError(err.message || "Failed to upload image.");
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col items-center">
            <div
                onClick={handleAvatarClick}
                className={`relative mb-3 flex h-[80px] w-[80px] min-h-[80px] min-w-[80px] items-center justify-center rounded-full border-[3px] border-[#ddd3cb] bg-[#cfb79f] text-[30px] text-[#7a6050] select-none overflow-hidden transition-all duration-300 ${
                    isOwnProfile && !isUploading ? "cursor-pointer hover:border-[#cfb79f] hover:brightness-95 active:scale-95" : ""
                }`}
                style={{ fontFamily: "var(--font-serif), serif" }}
            >
                {/* 1. Render image if exists, else initials */}
                {profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={profileImage}
                        alt="Profile Avatar"
                        className="h-full w-full object-cover rounded-full select-none"
                    />
                ) : (
                    <span>{initials}</span>
                )}

                {/* 2. Interactive hover overlay for owner */}
                {isOwnProfile && !isUploading && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
                        <Camera className="h-5 w-5 text-white" />
                    </div>
                )}

                {/* 3. Uploading spinner overlay */}
                {isUploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                )}
            </div>

            {/* Hidden Input for upload */}
            {isOwnProfile && (
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                />
            )}

            {/* Error Message */}
            {error && (
                <p className="mt-1 text-[10px] text-red-600 font-semibold max-w-[200px] leading-tight text-center">
                    {error}
                </p>
            )}
        </div>
    );
}
