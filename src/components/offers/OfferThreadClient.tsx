"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check, Clock, X, Lock, ArrowRight, MessageCircle, FileText, ChevronRight, ChevronLeft } from "lucide-react";
import OfferCountdown from "./OfferCountdown";
import { respondToOffer, withdrawMyOffer } from "@/app/actions/offers";
import type { SerializedOfferThread } from "@/lib/offers/serialize";

/**
 * Buyer/seller negotiation thread (3.2/3.3) as ONE tile. The header reads
 * left-to-right like the My Offers list card (image | details); status +
 * primary action, the negotiation history, and quick actions are sections
 * inside the same card, separated by dividers. Turn-aware actions: accept /
 * counter / decline for the party being asked, withdraw for the buyer,
 * pay-now when an accepted offer is awaiting payment.
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

  const cfg = statusConfig(offer, myTurn);
  const messageHref =
    offer.viewerRole === "BUYER"
      ? `/messages/start?sellerId=${offer.sellerId}&listingId=${offer.listing.id}`
      : `/messages`;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[640px] px-4 py-6">
      <Link href="/offers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All offers
      </Link>

      {/* ONE tile */}
      <div className="mt-4 overflow-hidden rounded-[22px] border border-border/70 bg-card shadow-[0_14px_36px_rgba(110,82,63,0.06)]">
        {/* Header — left-to-right like the list card */}
        <div className="flex">
          <div className="relative m-3 aspect-[3/4] w-[38%] shrink-0 overflow-hidden rounded-[16px] bg-muted">
            {offer.listing.imageUrl && (
              <Image src={offer.listing.imageUrl} alt={offer.listing.title} fill className="object-cover object-center" sizes="(max-width: 640px) 40vw, 240px" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center py-3 pr-4">
            <h1 className="truncate font-serif text-[24px] leading-tight text-foreground">{offer.listing.title}</h1>
            {(offer.listing.size || offer.listing.condition) && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {offer.listing.size ? `Size: ${offer.listing.size}` : ""}
                {offer.listing.size && offer.listing.condition ? " | " : ""}
                {offer.listing.condition ? `Condition: ${offer.listing.condition}` : ""}
              </p>
            )}
            <p className="mt-3 text-[12px] text-muted-foreground">{awaitingPayment ? "Your offer" : "Current offer"}</p>
            <p className="text-[24px] font-bold leading-none text-[#4a3328]">${offer.currentAmount?.toFixed(2)}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Asking ${offer.listing.price?.toFixed(2)}</p>
          </div>
        </div>

        {/* Status + primary action — tinted band inside the card */}
        <div className={`border-t border-border/70 px-4 py-4 ${cfg.band}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${cfg.iconBg}`}>
              <cfg.Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`font-serif text-[20px] leading-none ${cfg.titleColor}`}>{cfg.title}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{cfg.subtitle}</p>
            </div>
            {awaitingPayment && offer.payWindowExpiresAt ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#f6dede] px-3 py-1.5 text-[13px] font-medium text-[#b4443f]">
                <Clock className="h-3.5 w-3.5" />
                <OfferCountdown deadline={offer.payWindowExpiresAt} />
              </span>
            ) : isActive ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <OfferCountdown deadline={offer.expiresAt} />
              </span>
            ) : null}
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {awaitingPayment && (
            <>
              <Link href={`/buy/checkout?listingId=${offer.listing.id}`} className="mt-4 flex items-center justify-center gap-2 rounded-full bg-[#4a3328] py-3.5 text-[15px] font-semibold text-white">
                Pay now — ${offer.currentAmount?.toFixed(2)} <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Secure payment through Modaire
              </p>
            </>
          )}

          {myTurn && !counterOpen && (
            <div className="mt-4 flex gap-2">
              <button disabled={busy} onClick={() => run(() => respondToOffer(offer.id, "accept"))} className="flex-1 rounded-full bg-[#4a3328] py-3 text-sm font-semibold text-white disabled:opacity-50">Accept</button>
              <button disabled={busy} onClick={() => setCounterOpen(true)} className="flex-1 rounded-full border border-[#4a3328] py-3 text-sm font-semibold text-[#4a3328] disabled:opacity-50">Counter</button>
              <button disabled={busy} onClick={() => run(() => respondToOffer(offer.id, "reject"))} className="flex-1 rounded-full border border-border bg-card py-3 text-sm text-muted-foreground disabled:opacity-50">Decline</button>
            </div>
          )}

          {myTurn && counterOpen && (
            <div className="mt-4">
              <label className="text-sm text-muted-foreground">Your counteroffer</label>
              <div className="mt-2 flex items-center rounded-xl border border-border bg-card px-3 focus-within:border-[#4a3328]">
                <span className="text-muted-foreground">$</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} className="w-full bg-transparent py-3 pl-1 text-foreground outline-none" placeholder="0.00" />
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setCounterOpen(false)} className="flex-1 rounded-full border border-border bg-card py-3 text-sm text-foreground">Cancel</button>
                <button disabled={busy || !(Number(counterAmount) > 0)} onClick={() => run(() => respondToOffer(offer.id, "counter", Number(counterAmount))).then(() => setCounterOpen(false))} className="flex-1 rounded-full bg-[#4a3328] py-3 text-sm font-semibold text-white disabled:opacity-50">Send counter</button>
              </div>
            </div>
          )}

          {canWithdraw && !myTurn && (
            <button disabled={busy} onClick={() => run(() => withdrawMyOffer(offer.id))} className="mt-3 w-full text-center text-[13px] text-muted-foreground underline disabled:opacity-50">Withdraw offer</button>
          )}
        </div>

        {/* History */}
        <div className="border-t border-border/70 px-4 py-4">
          <h2 className="font-serif text-[20px] text-foreground">Offer History</h2>
          {offer.attemptCount > 1 && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Includes all {offer.attemptCount} offers {offer.viewerRole === "BUYER" ? "you've made" : "this buyer has made"} on this item.
            </p>
          )}
          <ol className="mt-3 space-y-4">
            {[...offer.events].reverse().map((e, i, arr) => (
              <li key={e.id} className="relative flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-[#4a3328]" : "bg-[#cdbfb3]"}`} />
                  {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-[#e1d7ce]" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] text-foreground">
                      {eventLabel(e.actor, e.type)}{e.amount != null ? ` — $${e.amount.toFixed(2)}` : ""}
                    </p>
                    {eventPill(e.type)}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{fmtDateTime(e.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Quick actions */}
        <div className="border-t border-border/70">
          <Link href={messageHref} className="flex items-center justify-between px-4 py-3.5 hover:bg-muted">
            <span className="flex items-center gap-3 text-[14px] text-foreground"><MessageCircle className="h-5 w-5 text-muted-foreground" /> {offer.viewerRole === "BUYER" ? "Message Seller" : "Message Buyer"}</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="mx-4 h-px bg-border/70" />
          <Link href={`/listings/${offer.listing.id}`} className="flex items-center justify-between px-4 py-3.5 hover:bg-muted">
            <span className="flex items-center gap-3 text-[14px] text-foreground"><FileText className="h-5 w-5 text-muted-foreground" /> View Listing</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function statusConfig(
  o: SerializedOfferThread,
  myTurn: boolean,
): { band: string; badge: string; iconBg: string; titleColor: string; title: string; subtitle: string; Icon: typeof Check } {
  const GREEN = { band: "bg-[#eef4ee]", badge: "bg-[#dcebdc] text-[#3f6b47]", iconBg: "bg-[#3f6b47]", titleColor: "text-[#3f6b47]" };
  const TAN = { band: "bg-[#f8f3ee]", badge: "bg-[#f3e9df] text-[#5f4437]", iconBg: "bg-[#5f4437]", titleColor: "text-[#5f4437]" };
  const ROSE = { band: "bg-[#f9f0f0]", badge: "bg-[#f0e2e2] text-[#9a5a5a]", iconBg: "bg-[#9a5a5a]", titleColor: "text-[#9a5a5a]" };
  const GREY = { band: "bg-[#f3f0ed]", badge: "bg-[#ece7e2] text-[#8a8078]", iconBg: "bg-[#8a8078]", titleColor: "text-[#6b6159]" };
  const buyer = o.viewerRole === "BUYER";

  switch (o.status) {
    case "ACCEPTED":
      return { ...GREEN, Icon: Check, title: "Accepted", subtitle: buyer ? "The seller has accepted your offer!" : "You accepted this offer — awaiting payment." };
    case "COMPLETED":
      return { ...GREEN, Icon: Check, title: "Purchased", subtitle: "This offer was completed." };
    case "PENDING":
      return { ...TAN, Icon: Clock, title: myTurn ? "Action needed" : "Pending", subtitle: myTurn ? "Respond to this offer." : `Waiting for the ${buyer ? "seller" : "buyer"} to respond.` };
    case "COUNTERED":
      return { ...TAN, Icon: Clock, title: myTurn ? "Counteroffer" : "Countered", subtitle: myTurn ? "Respond to the counteroffer." : "Waiting for a response." };
    case "REJECTED":
      return { ...ROSE, Icon: X, title: "Declined", subtitle: "This offer was declined." };
    case "WITHDRAWN":
      return { ...GREY, Icon: X, title: "Withdrawn", subtitle: "This offer was withdrawn." };
    case "EXPIRED":
    default:
      return { ...GREY, Icon: Clock, title: "Expired", subtitle: "This offer expired without completion." };
  }
}

function eventPill(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    ACCEPT: { label: "Accepted", cls: "bg-[#dcebdc] text-[#3f6b47]" },
    REJECT: { label: "Declined", cls: "bg-[#f0e2e2] text-[#9a5a5a]" },
    PAID: { label: "Paid", cls: "bg-[#dcebdc] text-[#3f6b47]" },
    EXPIRE: { label: "Expired", cls: "bg-[#ece7e2] text-[#8a8078]" },
    WITHDRAW: { label: "Withdrawn", cls: "bg-[#ece7e2] text-[#8a8078]" },
  };
  const p = map[type];
  if (!p) return null;
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${p.cls}`}>{p.label}</span>;
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

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
