"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import OfferCountdown from "./OfferCountdown";
import { respondToOffer, withdrawMyOffer } from "@/app/actions/offers";
import type { SerializedOfferThread } from "@/lib/offers/serialize";

/**
 * Buyer/seller negotiation thread (3.2/3.3): status, current amount, countdown,
 * history, and the actions available to the viewer given whose turn it is.
 */
export default function OfferThreadClient({ initial }: { initial: SerializedOfferThread }) {
  const router = useRouter();
  const [offer, setOffer] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");

  const isActive = offer.status === "PENDING" || offer.status === "COUNTERED";
  const myTurn = isActive && offer.currentTurn === offer.viewerRole;
  const canWithdraw = isActive && offer.viewerRole === "BUYER";
  const awaitingPayment =
    offer.status === "ACCEPTED" && offer.viewerRole === "BUYER" && offer.paymentState === "AWAITING_PAYMENT";

  async function run(fn: () => Promise<{ ok: boolean; data?: SerializedOfferThread; message?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok && res.data) {
      setOffer(res.data);
      router.refresh();
    } else {
      setError(res.message ?? "Something went wrong.");
    }
  }

  const statusLabel: Record<string, string> = {
    PENDING: "Pending — awaiting response",
    COUNTERED: "Countered",
    ACCEPTED: "Accepted",
    REJECTED: "Declined",
    EXPIRED: "Expired",
    WITHDRAWN: "Withdrawn",
    COMPLETED: "Purchased",
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <Link href="/offers" className="text-sm text-[#7a6f66]">&larr; All offers</Link>

      {/* Listing header */}
      <div className="mt-4 flex gap-3">
        {offer.listing.imageUrl && (
          <Image src={offer.listing.imageUrl} alt={offer.listing.title} width={64} height={64} className="h-16 w-16 rounded-lg object-cover" />
        )}
        <div>
          <Link href={`/listings/${offer.listing.id}`} className="font-medium text-[#2f2925]">{offer.listing.title}</Link>
          <p className="text-sm text-[#7a6f66]">Asking ${offer.listing.price?.toFixed(2)}</p>
        </div>
      </div>

      {/* Current state */}
      <div className="mt-4 rounded-xl border border-[#eadfd6] bg-[#fbf8f5] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#2f2925]">{statusLabel[offer.status] ?? offer.status}</span>
          {isActive && <OfferCountdown deadline={offer.expiresAt} />}
          {awaitingPayment && offer.payWindowExpiresAt && <OfferCountdown deadline={offer.payWindowExpiresAt} label="Pay within" />}
        </div>
        <p className="mt-1 text-2xl font-semibold text-[#2f2925]">${offer.currentAmount?.toFixed(2)}</p>
        {isActive && (
          <p className="mt-1 text-sm text-[#7a6f66]">
            {myTurn ? "It's your turn to respond." : `Waiting on the ${offer.currentTurn === "SELLER" ? "seller" : "buyer"}.`}
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Actions */}
      {awaitingPayment && (
        <Link href={`/buy/checkout?listingId=${offer.listing.id}`} className="mt-4 block rounded-full bg-[#2f2925] py-3 text-center text-sm font-medium text-white">
          Pay now — ${offer.currentAmount?.toFixed(2)}
        </Link>
      )}

      {myTurn && !counterOpen && (
        <div className="mt-4 flex gap-2">
          <button disabled={busy} onClick={() => run(() => respondToOffer(offer.id, "accept"))} className="flex-1 rounded-full bg-[#2f2925] py-2.5 text-sm font-medium text-white disabled:opacity-50">Accept</button>
          <button disabled={busy} onClick={() => setCounterOpen(true)} className="flex-1 rounded-full border border-[#2f2925] py-2.5 text-sm font-medium text-[#2f2925] disabled:opacity-50">Counter</button>
          <button disabled={busy} onClick={() => run(() => respondToOffer(offer.id, "reject"))} className="flex-1 rounded-full border border-[#ddd3cb] py-2.5 text-sm text-[#7a6f66] disabled:opacity-50">Decline</button>
        </div>
      )}

      {myTurn && counterOpen && (
        <div className="mt-4 rounded-xl border border-[#eadfd6] p-4">
          <label className="text-sm text-[#7a6f66]">Your counteroffer</label>
          <div className="mt-2 flex items-center rounded-xl border border-[#ddd3cb] px-3 focus-within:border-[#2f2925]">
            <span className="text-[#7a6f66]">$</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} className="w-full bg-transparent py-2.5 pl-1 text-[#2f2925] outline-none" placeholder="0.00" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setCounterOpen(false)} className="flex-1 rounded-full border border-[#ddd3cb] py-2.5 text-sm text-[#2f2925]">Cancel</button>
            <button
              disabled={busy || !(Number(counterAmount) > 0)}
              onClick={() => run(() => respondToOffer(offer.id, "counter", Number(counterAmount))).then(() => setCounterOpen(false))}
              className="flex-1 rounded-full bg-[#2f2925] py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Send counter
            </button>
          </div>
        </div>
      )}

      {canWithdraw && !myTurn && !counterOpen && (
        <button disabled={busy} onClick={() => run(() => withdrawMyOffer(offer.id))} className="mt-4 text-sm text-[#7a6f66] underline disabled:opacity-50">Withdraw offer</button>
      )}

      {/* History */}
      <h3 className="mt-8 text-sm font-medium text-[#2f2925]">History</h3>
      <ul className="mt-2 space-y-2">
        {offer.events.map((e) => (
          <li key={e.id} className="flex items-center justify-between text-sm">
            <span className="text-[#2f2925]">{eventLabel(e.actor, e.type)}{e.amount != null ? ` — $${e.amount.toFixed(2)}` : ""}</span>
            <span className="text-[#b3a89e]">{new Date(e.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function eventLabel(actor: string, type: string) {
  const who = actor === "BUYER" ? "Buyer" : actor === "SELLER" ? "Seller" : "System";
  const act: Record<string, string> = {
    OFFER: "made an offer",
    COUNTER: "countered",
    ACCEPT: "accepted",
    REJECT: "declined",
    WITHDRAW: "withdrew",
    EXPIRE: "expired",
    PAID: "paid",
  };
  return `${who} ${act[type] ?? type}`;
}
