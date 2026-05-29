"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Pencil } from "lucide-react";
import { updateUserProfilePicture, deleteUserProfilePicture } from "@/app/actions/auth";

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
            const formData = new FormData();
            formData.append("userId", sellerId);
            formData.append("file", file);

            const res = await updateUserProfilePicture(formData);
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

    const handleRemoveClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isOwnProfile || isUploading) return;

        setIsUploading(true);
        setError(null);

        try {
            const res = await deleteUserProfilePicture(sellerId);
            if (res.error) {
                setError(res.error);
            } else {
                setProfileImage(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
                router.refresh();
            }
        } catch (err: any) {
            setError(err.message || "Failed to remove image.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col items-center">
            {/* Interactive container with group for synchronized hover scale states */}
            <div className="relative mb-2 group">
                {/* 1. Main Avatar Circle */}
                <div
                    onClick={handleAvatarClick}
                    className={`relative flex h-[80px] w-[80px] min-h-[80px] min-w-[80px] items-center justify-center rounded-full border-[3px] border-[#ddd3cb] bg-[#cfb79f] text-[30px] text-[#7a6050] select-none overflow-hidden transition-all duration-300 ${
                        isOwnProfile && !isUploading ? "cursor-pointer hover:border-[#cfb79f] hover:brightness-95 active:scale-95" : ""
                    }`}
                    style={{ fontFamily: "var(--font-serif), serif" }}
                >
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

                    {/* Interactive hover overlay for owner */}
                    {isOwnProfile && !isUploading && (
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <Camera className="h-5 w-5 text-white" />
                        </div>
                    )}

                    {/* Uploading spinner overlay */}
                    {isUploading && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 text-white animate-spin" />
                        </div>
                    )}
                </div>

                {/* 2. Sleek bottom-right edit pencil badge for owner */}
                {isOwnProfile && !isUploading && (
                    <div
                        onClick={handleAvatarClick}
                        className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border border-[#ddd3cb] bg-white text-[#7a6050] shadow-[0_2px_4px_rgba(0,0,0,0.08)] transition-all duration-200 group-hover:scale-110 active:scale-95 cursor-pointer hover:bg-[#faf6f0] hover:text-[#cfb79f] z-20"
                        title="Change profile picture"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </div>
                )}
            </div>

            {profileImage && isOwnProfile && !isUploading && (
                <button
                    type="button"
                    onClick={handleRemoveClick}
                    className="mb-2 text-[11px] font-medium text-[#7a6050]/70 hover:text-red-500 transition-colors cursor-pointer select-none"
                >
                    Remove Photo
                </button>
            )}

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
