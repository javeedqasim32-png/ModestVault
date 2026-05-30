export default function EmptyBagIllustration({ size = 80 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 80 80"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#7a5a45]"
        >
            <path d="M28 30 V22 Q28 14 40 14 Q52 14 52 22 V30" />
            <path d="M22 30 H58 Q60 30 60 32 L58 64 Q58 68 54 68 H26 Q22 68 22 64 L20 32 Q20 30 22 30 Z" />
            <path d="M32 38 Q40 44 48 38" />
        </svg>
    );
}
