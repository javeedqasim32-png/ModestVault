import { Zap } from "lucide-react";

type Props = {
    medianMinutes: number;
};

function formatResponse(minutes: number) {
    if (minutes < 60) {
        // Bucket to natural-sounding values instead of arbitrary "~7m" / "~13m".
        if (minutes < 5) return "<5m";
        if (minutes < 10) return "~5m";
        if (minutes < 20) return "~15m";
        if (minutes < 40) return "~30m";
        return "~45m";
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `~${hours}h`;
    const days = Math.round(hours / 24);
    return `~${days}d`;
}

export default function UserResponseBadge({ medianMinutes }: Props) {
    return (
        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#5f4437]">
            <Zap className="h-3 w-3 fill-amber-500 text-amber-500" strokeWidth={2} />
            Avg. response: {formatResponse(medianMinutes)}
        </span>
    );
}
