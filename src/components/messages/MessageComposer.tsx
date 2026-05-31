"use client";

import { useRef, useState } from "react";

type Props = {
    action: (formData: FormData) => Promise<void>;
};

const MAX_LENGTH = 1000;

export default function MessageComposer({ action }: Props) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [pending, setPending] = useState(false);
    const [isEmpty, setIsEmpty] = useState(true);

    const getText = () => editorRef.current?.innerText.trim() ?? "";

    const submit = async () => {
        const body = getText().slice(0, MAX_LENGTH);
        if (!body) return;
        setPending(true);
        try {
            const formData = new FormData();
            formData.set("body", body);
            await action(formData);
            const el = editorRef.current;
            if (el) {
                el.innerText = "";
                el.focus();
                setIsEmpty(true);
            }
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

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                void submit();
            }}
            className="flex items-end gap-2"
        >
            <div className="relative flex-1">
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
                        Type your message
                    </div>
                ) : null}
            </div>
            <button
                type="submit"
                disabled={pending || isEmpty}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#a07c61] px-5 text-[14px] font-medium text-white transition-opacity disabled:opacity-60"
            >
                Send
            </button>
        </form>
    );
}
