"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import SignInPromptModal from "@/components/auth/SignInPromptModal";
import { submitOffer } from "@/app/actions/offers";

/**
 * Listing-detail "Make an Offer" entry (3.1). Guests get the sign-in modal.
 * If the buyer already has an active offer, this links them to that thread
 * instead. Otherwise it opens a two-step sheet: enter amount -> confirm ->
 * submit via the submitOffer server action.
 */
export default function MakeOfferButton({
  listingId,
  askingPrice,
  isAuthed,
  existingOfferId,
}: {
  listingId: string;
  askingPrice: number;
  isAuthed: boolean;
  existingOfferId: string | null;
}) {
  const router = useRouter();
  const [promptOpen, setPromptOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"enter" | "confirm" | "done">("enter");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pill =
    "inline-flex h-9 w-[170px] items-center justify-center gap-1.5 rounded-full border border-[#2f2925] bg-transparent px-3 text-[12px] font-medium text-[#2f2925] whitespace-nowrap transition hover:bg-[#2f2925] hover:text-white";

  if (existingOfferId) {
    return (
      <button type="button" onClick={() => router.push(`/offers/${existingOfferId}`)} className={pill}>
        <Tag className="h-4 w-4" /> View your offer
      </button>
    );
  }

  const openSheet = () => {
    if (!isAuthed) return setPromptOpen(true);
    setStep("enter");
    setAmount("");
    setError(null);
    setOpen(true);
  };

  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= askingPrice;

  const proceed = () => {
    if (!amountValid) {
      setError(numericAmount > askingPrice ? "Offer can't exceed the asking price." : "Enter a valid amount.");
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    const res = await submitOffer(listingId, numericAmount);
    setSubmitting(false);
    if (res.ok) {
      setStep("done");
      router.refresh();
    } else {
      setError(res.message);
      setStep("enter");
    }
  };

  return (
    <>
      <button type="button" onClick={openSheet} className={pill}>
        <Tag className="h-4 w-4" /> Make an Offer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => !submitting && setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            {step === "enter" && (
              <>
                <h2 className="text-lg font-semibold text-[#2f2925]">Make an offer</h2>
                <p className="mt-1 text-sm text-[#7a6f66]">Asking price ${askingPrice.toFixed(2)}. Enter your offer below.</p>
                <div className="mt-4 flex items-center rounded-xl border border-[#ddd3cb] px-3 focus-within:border-[#2f2925]">
                  <span className="text-[#7a6f66]">$</span>
                  <input
                    type="number" inputMode="decimal" min="0" max={askingPrice} step="0.01"
                    autoFocus value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-transparent py-3 pl-1 text-[#2f2925] outline-none"
                    placeholder="0.00"
                  />
                </div>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setOpen(false)} className="flex-1 rounded-full border border-[#ddd3cb] py-2.5 text-sm text-[#2f2925]">Cancel</button>
                  <button onClick={proceed} disabled={!amountValid} className="flex-1 rounded-full bg-[#2f2925] py-2.5 text-sm font-medium text-white disabled:opacity-40">Review</button>
                </div>
              </>
            )}

            {step === "confirm" && (
              <>
                <h2 className="text-lg font-semibold text-[#2f2925]">Confirm your offer</h2>
                <p className="mt-2 text-sm text-[#7a6f66]">
                  You&apos;re offering <span className="font-semibold text-[#2f2925]">${numericAmount.toFixed(2)}</span>. The seller has 48 hours to accept, decline, or counter. You&apos;ll be notified.
                </p>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setStep("enter")} disabled={submitting} className="flex-1 rounded-full border border-[#ddd3cb] py-2.5 text-sm text-[#2f2925]">Back</button>
                  <button onClick={confirm} disabled={submitting} className="flex-1 rounded-full bg-[#2f2925] py-2.5 text-sm font-medium text-white disabled:opacity-60">
                    {submitting ? "Sending…" : "Submit offer"}
                  </button>
                </div>
              </>
            )}

            {step === "done" && (
              <>
                <h2 className="text-lg font-semibold text-[#2f2925]">Offer sent</h2>
                <p className="mt-2 text-sm text-[#7a6f66]">Your ${numericAmount.toFixed(2)} offer was sent to the seller. You&apos;ll be notified when they respond.</p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setOpen(false)} className="flex-1 rounded-full border border-[#ddd3cb] py-2.5 text-sm text-[#2f2925]">Close</button>
                  <button onClick={() => router.push("/offers")} className="flex-1 rounded-full bg-[#2f2925] py-2.5 text-sm font-medium text-white">View my offers</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SignInPromptModal open={promptOpen} onClose={() => setPromptOpen(false)} intent="offer" callbackUrl={`/listings/${listingId}`} />
    </>
  );
}
