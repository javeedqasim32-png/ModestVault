"use client";

import { useEffect, useState } from "react";

/** Live countdown to an ISO deadline (3.3). Renders "expired" once passed. */
export default function OfferCountdown({ deadline, label }: { deadline: string; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const msLeft = new Date(deadline).getTime() - now;
  if (msLeft <= 0) {
    return <span className="text-sm text-red-600">{label ? `${label}: ` : ""}expired</span>;
  }
  const s = Math.floor(msLeft / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const text = h >= 1 ? `${h}h ${m}m` : m >= 1 ? `${m}m ${sec}s` : `${sec}s`;
  const urgent = msLeft < 3600_000;
  return (
    <span className={`text-sm ${urgent ? "text-red-600" : "text-[#7a6f66]"}`}>
      {label ? `${label}: ` : ""}
      {text} left
    </span>
  );
}
