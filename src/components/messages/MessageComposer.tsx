"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

type Props = {
    action: (formData: FormData) => Promise<void>;
};

const MAX_LENGTH = 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export default function MessageComposer({ action }: Props) {
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pending, setPending] = useState(false);
    const [isEmpty, setIsEmpty] = useState(true);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);

    // Free the object URL when the staged image changes or the component unmounts
    // so we don't leak blob URLs across multiple attach/remove cycles.
    useEffect(() => {
        if (!imagePreview) return;
        return () => URL.revokeObjectURL(imagePreview);
    }, [imagePreview]);

    const getText = () => editorRef.current?.innerText.trim() ?? "";

    const canSend = (!isEmpty || !!imageFile) && !pending;

    const clearStagedImage = () => {
        setImageFile(null);
        setImagePreview(null);
        setImageError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const submit = async () => {
        if (!canSend) return;
        const body = getText().slice(0, MAX_LENGTH);
        setPending(true);
        try {
            const formData = new FormData();
            formData.set("body", body);
            if (imageFile) formData.set("imageFile", imageFile);
            await action(formData);
            const el = editorRef.current;
            if (el) {
                el.innerText = "";
                el.focus();
                setIsEmpty(true);
            }
            clearStagedImage();
        } finally {
            setPending(false);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // iMessage-style: Enter sends, Shift+Enter inserts a newline.
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
        }
    };

    const handleInput = () => {
        const el = editorRef.current;
        if (!el) return;
        const text = el.innerText;
        setIsEmpty(text.trim().length === 0);
        // Enforce max length; trim and move cursor to end if exceeded.
        if (text.length > MAX_LENGTH) {
            el.innerText = text.slice(0, MAX_LENGTH);
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(el);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
        // Strip rich formatting on paste — match iMessage behavior of plain text only.
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!ALLOWED_MIME.includes(file.type)) {
            setImageError("Only PNG, JPEG, or WebP images are allowed.");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setImageError("Image must be 10MB or smaller.");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        setImageError(null);
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                void submit();
            }}
            className="flex flex-col gap-2"
        >
            {imagePreview ? (
                <div className="flex items-start gap-2">
                    <div className="relative inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={imagePreview}
                            alt="Selected attachment preview"
                            className="block max-h-[88px] w-auto rounded-[12px] border border-[#ddd3cb] object-cover"
                        />
                        <button
                            type="button"
                            onClick={clearStagedImage}
                            aria-label="Remove attached image"
                            className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2f2925] text-white shadow"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            ) : null}
            {imageError ? (
                <p className="text-[12px] text-red-600">{imageError}</p>
            ) : null}
            <div className="flex min-w-0 items-end gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pending}
                    aria-label="Attach a photo"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ddd3cb] bg-white text-[#2f2925] transition-opacity disabled:opacity-60"
                >
                    <Paperclip className="h-5 w-5" />
                </button>
                <div className="relative flex-1 min-w-0">
                    <div
                        ref={editorRef}
                        role="textbox"
                        aria-multiline="true"
                        aria-label="Type your message"
                        contentEditable={!pending}
                        suppressContentEditableWarning
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        className="max-h-[120px] min-h-[44px] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-[22px] border border-[#ddd3cb] bg-white px-4 py-2.5 text-[15px] leading-snug text-[#2f2925] focus:outline-none focus:border-[#a07c61]"
                    />
                    {isEmpty ? (
                        <div className="pointer-events-none absolute inset-0 select-none px-4 py-2.5 text-[15px] leading-snug text-[#8a7667]">
                            {imageFile ? "Add a caption (optional)" : "Type your message"}
                        </div>
                    ) : null}
                </div>
                <button
                    type="submit"
                    disabled={!canSend}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#a07c61] px-5 text-[14px] font-medium text-white transition-opacity disabled:opacity-60"
                >
                    Send
                </button>
            </div>
        </form>
    );
}
