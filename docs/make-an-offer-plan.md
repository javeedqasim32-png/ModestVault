# Make an Offer — Implementation Plan

Negotiation / offers system for Modaire (Requirements 3.1–3.4).

## Surfaces & how the work splits

Two front-ends, one backend. Build the core **once**, expose it **twice**, build UI **twice**.

| Layer | Where | Shared? |
|---|---|---|
| Data model (Prisma) | `prisma/schema.prisma` | shared |
| Business logic / state machine | `src/lib/offers/` (new) | shared |
| Expiration crons | `src/app/api/internal/*` | shared |
| Notifications | `createNotification` (auto-pushes) | shared |
| Web UI + entry | server actions in `src/app/actions/offers.ts` + components | web only (responsive = desktop + mobile browser) |
| App UI + entry | `/api/v1/offers/*` + Flutter screens in `modaire_app/` | app only |

**Golden rule:** no business logic in a route handler, a server action, or Flutter. All of it lives in `src/lib/offers/` and both entry layers are thin wrappers. This is how checkout is already structured (`src/app/actions/checkout.ts` holds logic; `/api/v1/checkout/*` wraps it).

---

## 1. Data model

Two new models. Offers are a **structured state machine with money + deadlines** — kept separate from freeform messaging (`Conversation`/`ConversationMessage`), though we can surface offer events in the chat thread later.

```prisma
model Offer {
  id            String   @id @default(uuid())
  listing_id    String
  listing       Listing  @relation(fields: [listing_id], references: [id])
  buyer_id      String
  buyer         User     @relation("OfferBuyer", fields: [buyer_id], references: [id])
  seller_id     String
  seller        User     @relation("OfferSeller", fields: [seller_id], references: [id])

  status        String   @default("PENDING")
  // PENDING   – buyer offered, awaiting seller (48h)
  // COUNTERED – seller countered, awaiting buyer (own deadline)
  // ACCEPTED  – accepted; either charged (COMPLETED) or awaiting payment (see payment_state)
  // REJECTED  – declined
  // EXPIRED   – deadline passed with no response
  // WITHDRAWN – buyer pulled it
  // COMPLETED – paid; sale done

  current_amount Decimal          // amount on the table right now
  current_turn   String           // SELLER | BUYER — who must respond next
  expires_at     DateTime         // active deadline for current_turn

  // Payment path (decided at accept time)
  binding        Boolean  @default(false)   // card confirmed up front → auto-charge on accept
  setup_intent_id String?                   // SetupIntent that saved the card (binding offers)
  payment_state  String?  // null | AUTO_CHARGED | AWAITING_PAYMENT | PAID | CHARGE_FAILED
  pay_window_expires_at DateTime?           // fallback "pay now" deadline when AWAITING_PAYMENT
  purchase_id    String?  @unique           // set once converted to a Purchase

  events        OfferEvent[]
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  // One active negotiation per (buyer, listing). Enforce "active" in app logic;
  // allow historical rows. (Partial unique index on status in (PENDING,COUNTERED) if supported.)
  @@index([listing_id, status])
  @@index([buyer_id, status, updated_at])
  @@index([seller_id, status, updated_at])
  @@index([status, expires_at])            // cron sweep
}

model OfferEvent {
  id         String   @id @default(uuid())
  offer_id   String
  offer      Offer    @relation(fields: [offer_id], references: [id], onDelete: Cascade)
  actor      String   // BUYER | SELLER | SYSTEM
  type       String   // OFFER | COUNTER | ACCEPT | REJECT | EXPIRE | WITHDRAW | PAID
  amount     Decimal?
  created_at DateTime @default(now())

  @@index([offer_id, created_at])
}
```

`Listing` additions:
- `offers_enabled Boolean @default(true)` — per-listing toggle for "eligible listings" (3.1). Seller can turn off.
- A reservation marker for the fallback pay-window (see §5): `reserved_offer_id String?` + `reserved_until DateTime?`, **or** reuse `status = "RESERVED"`. Recommend `status` gains `RESERVED` alongside AVAILABLE/SOLD.

The `OfferEvent` chain is the **negotiation history** (3.2). `status` + `current_amount` give "current amount and status clearly."

---

## 2. Offer state machine (the heart)

```
                 buyer offers
        ┌──────────────────────────► PENDING ──(48h, no response)──► EXPIRED
        │                             │  │  │
        │              seller rejects │  │  └── seller accepts ──► (accept flow, §5)
        │                             ▼  │
        │                          REJECTED
        │          seller counters     │
        │   ┌──────────────────────────┘
        │   ▼
        │  COUNTERED ──(counter deadline, no response)──► EXPIRED
        │   │  │  │
        │   │  │  └── buyer accepts ──► (accept flow, §5)
        │   │  └──── buyer rejects ──► REJECTED
        │   └─────── buyer counters ──┘ (back to PENDING, seller's turn)
        │
   WITHDRAWN (buyer cancels an active offer any time before accept)
```

Transitions are **guarded**: every one re-checks listing availability, actor identity, amount validity (≤ asking price for a buyer offer; any positive amount for a counter), and that the offer is still in an actionable state (optimistic-lock on `updated_at` to avoid double-accept races).

---

## 3. Shared business logic — `src/lib/offers/`

- `createOffer(buyerId, listingId, amount, {paymentMethodId?})` — validates listing is AVAILABLE + APPROVED + `offers_enabled`, buyer ≠ seller, amount > 0 and ≤ asking. Sets `binding` if a card was confirmed. Writes Offer + first OfferEvent. Notifies seller (`OFFER_RECEIVED`). Runs competing-offer check (§7).
- `counterOffer(actorId, offerId, amount)` — seller or buyer; flips `current_turn`, resets `expires_at` to the counter deadline, appends event, notifies the other party (`OFFER_COUNTERED`).
- `acceptOffer(actorId, offerId)` — see §5. Notifies (`OFFER_ACCEPTED`).
- `rejectOffer(actorId, offerId)` — status REJECTED, notify (`OFFER_REJECTED`).
- `withdrawOffer(buyerId, offerId)` — buyer-only, pre-accept.
- `expireOffers()` — cron entrypoint (§6).
- `getOfferThread(userId, offerId)` / `listOffersForBuyer` / `listOffersForSeller` / `listOffersForListing` — reads with authorization.

All money as `Decimal`; convert to cents only at the Stripe boundary (mirrors checkout).

---

## 4. Entry layers (thin)

**Web** — `src/app/actions/offers.ts` (server actions): `submitOffer`, `respondToOffer` (accept/reject/counter), `withdrawOffer`, plus reads for the UI. Each calls `src/lib/offers` and does `revalidatePath`.

**App** — `/api/v1/offers/` (mirrors the v1 pattern, `requireBearer` auth):
```
POST   /api/v1/offers                      submit an offer
GET    /api/v1/offers                      my offers (buyer + seller views via ?role=)
GET    /api/v1/offers/[id]                 one thread (history, status, countdown)
POST   /api/v1/offers/[id]/accept
POST   /api/v1/offers/[id]/reject
POST   /api/v1/offers/[id]/counter
POST   /api/v1/offers/[id]/withdraw
GET    /api/v1/listings/[id]/offer-eligibility   (button state for 3.1)
```

---

## 5. Checkout integration (accept → sale)

This is the trickiest part and reuses existing checkout machinery.

**Decided model:** on accept, if the buyer has a saved card + consent → charge off-session → instant sale; else (or on charge failure) → reserve the item + "pay now" window.

- **Offer-aware pricing.** `getEffectivePriceForListing(listingId)` ([checkout.ts](../src/app/actions/checkout.ts)) gains an offer-aware variant: for a buyer with an ACCEPTED offer on that listing, effective price = the accepted `current_amount`, not the list price. This keeps pricing **server-derived** (never trust client) while honoring the negotiated price.

- **Binding path (card on file).** At offer time, buyer confirms a card via a **SetupIntent** (saves card, *no* hold; `setup_future_usage`). On accept: server creates a PaymentIntent `off_session: true` against the saved method at the agreed price → on success, run the **existing finalize** path (`finalizeCheckout`) to create Purchase + Order, mark Offer COMPLETED, Listing SOLD. On `requires_action`/decline → fall through to fallback.
  - **Prereq:** start saving cards at *normal* checkout too (consent + `setup_future_usage`), so returning buyers have a card on file. Until then, every offer uses the fallback.

- **Fallback path (pay now).** On accept with no card / failed charge: set Listing `RESERVED` for this buyer, `payment_state = AWAITING_PAYMENT`, `pay_window_expires_at = now + 24h`. Buyer gets a "seller accepted — pay now" prompt; checkout uses the offer-aware price. Pay → SOLD + COMPLETED. Window expires unpaid → release reservation (Listing AVAILABLE), status back so the item is live again, notify both.

- **Seller clarity.** Each offer is tagged **"Instant — card on file"** vs **"Payment on acceptance"** so the seller knows what accepting does *before* they tap it.

---

## 6. Expiration engine (crons)

Two sweeps, same pattern as `release-seller-transfers` (internal route + `x-cron-secret` + crontab line):

- `POST /api/internal/expire-offers` — every ~5 min. Expires PENDING/COUNTERED past `expires_at` → status EXPIRED, event, notify (`OFFER_EXPIRED`). Also releases reservations past `pay_window_expires_at` → Listing AVAILABLE, offer EXPIRED, notify.
- Countdown timer (3.3) is **client-rendered from `expires_at`** — no server work; both web and Flutter tick locally.
- Counteroffer "has its own deadline" (3.3) → `counterOffer` sets a fresh `expires_at` (recommend same 48h, configurable).

Add one crontab line with the rotated `INTERNAL_CRON_SECRET` (see `docs`/memory for the dispatch-cron precedent).

---

## 7. Competing-offer notifications (3.4)

On every new/raised offer, compare active offers for the listing:
- Notify lower active offerers (`OFFER_OUTBID`) — "Someone has placed a higher offer." **Never reveal identity or exact amount.**
- The buyer's thread shows **how many active offers are currently higher** (count only).
- Buyer can revise upward while their offer is active (`counterOffer` from buyer side, or a dedicated `raiseOffer`).
- Privacy: all competing-offer reads return **counts and booleans only**, never other buyers' rows.

---

## 8. Notifications (free via existing push)

New `createNotification` types — each auto-enqueues push + in-app (the system we just built):
`OFFER_RECEIVED` (→ seller), `OFFER_COUNTERED`, `OFFER_ACCEPTED`, `OFFER_REJECTED`, `OFFER_EXPIRED`, `OFFER_OUTBID`.
`linkUrl` → the offer thread; add a deep-link mapping in the app's push service (`/offers/:id` → offers screen).

---

## 9. UI

**Web (`src/app`)** — responsive, covers desktop + mobile browser:
- "Make an Offer" button on eligible listing pages (gated by eligibility) + offer modal with confirmation (3.1).
- Buyer "My Offers" + Seller "Offers" views: thread with history, current amount/status, countdown, accept/reject/counter actions (3.2/3.3).
- Competing-offer banner ("Someone placed a higher offer", count of higher) (3.4).

**App (Flutter, `modaire_app`)** — mirror the web:
- Button on `listing_detail_screen.dart`; offer sheet + confirmation.
- Offers list + thread screens (new feature folder `lib/features/offers/`).
- Countdown widget; competing-offer banner.
- Repos in `lib/core/offers/` calling `/api/v1/offers`.

---

## 10. Edge cases to handle explicitly

- Item sells (full price) while offers are pending → auto-expire/withdraw all open offers, notify.
- Two offers accepted? Prevent — accepting one on a binding instant-charge sells it; reservation locks it for the fallback. Guard with listing status + optimistic lock.
- Buyer withdraws after seller accepted-but-unpaid → allowed? Recommend no once reserved; allow before accept.
- Seller counters above asking price → allowed (it's a negotiation), but buyer offer must be ≤ asking.
- Buyer has multiple-item interest → one active offer per (buyer, listing).
- Off-session charge succeeds but finalize fails → refund + mark CHARGE_FAILED → fallback. (Reuse checkout's idempotency.)
- Seller disabled / listing unpublished mid-negotiation → expire offers.

---

## 11. Phasing (don't build all four at once)

**Phase 1 — core loop (3.1 + basic 3.2):** data model, `createOffer`/`accept`/`reject`, fallback "pay now" path only (skip binding/auto-charge first), notifications, web UI + app UI. This is a shippable offer system.

**Phase 2 — counters + expiration (rest of 3.2 + 3.3):** counteroffers, negotiation history UI, 48h cron, countdown timers.

**Phase 3 — instant charge (the card-on-file optimization):** start saving cards at checkout, SetupIntent at offer time, off-session charge on accept, "Instant vs Payment-on-acceptance" tagging.

**Phase 4 — competing offers (3.4):** outbid notifications, higher-offer counts, raise-offer.

Each phase is independently shippable and testable.

---

## 12. Open decisions (confirm before Phase 1)

1. **Counter deadline length** — same 48h as initial, or shorter?
2. **Fallback pay-window length** — 24h suggested.
3. **Reserve vs first-to-pay in the fallback** — plan assumes **reserve** (item offline during pay-window).
4. **Multiple offers per listing** — plan allows many buyers, one active offer each; seller accepts one → others expire.
5. **Minimum offer floor** — allow any amount ≤ asking, or enforce a floor (e.g. ≥ 50% of asking) to curb lowballs?
6. **Offers on bundles/cart** — out of scope for v1 (offers are per-listing).
