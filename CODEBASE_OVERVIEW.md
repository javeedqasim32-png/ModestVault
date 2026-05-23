# Modaire — Codebase Overview

> Generated: 2026-05-17. Do not edit manually — regenerate from source when major changes land.

---

## Executive Summary

**Modaire** (package name `modaire`, repo folder `ModestVault`) is a peer-to-peer modest fashion marketplace built on Next.js 16. Sellers list garments for sale, buyers browse, pay via Stripe, and receive physical shipments tracked through Shippo. The platform handles its own seller onboarding (Stripe Connect Express), email-verified signups (OTP), image processing (S3 + Sharp), order lifecycle management, and a 3-day post-delivery payout hold before funds are transferred to sellers.

The app is in active development with a working end-to-end flow. Several areas (messaging UI, admin breadth, notifications, payout dashboard) are present but incomplete.

---

## Architecture Overview

```
Browser / Mobile
       │
  Next.js 16 (App Router, React 19, TypeScript 5)
       │
  ┌────┴─────────────────────────────────────────────┐
  │  Server Components + Server Actions + API Routes  │
  └────┬─────────────────────────────────────────────┘
       │
  ┌────┴──────────────────────────────────────────────────────┐
  │  Prisma 7 + pg adapter  │  Stripe 20  │  Shippo 2  │  S3  │
  │  PostgreSQL              │  Connect    │  Shipping  │  AWS │
  └───────────────────────────────────────────────────────────┘
```

- **Rendering:** Server Components by default; Client Components opt-in with `"use client"`.
- **Mutations:** Next.js Server Actions (`"use server"`) — no REST layer for internal mutations.
- **API Routes:** Only for webhooks, internal cron, static file serving, and NextAuth.
- **Auth:** NextAuth.js v5 beta (JWT strategy, Credentials provider, bcrypt passwords).
- **ORM:** Prisma with `@prisma/adapter-pg` (direct pg pool, no connection pooler required).
- **Styling:** Tailwind CSS v4 with Cormorant Garamond editorial font.

---

## Folder Structure

```
ModestVault/
├── prisma/
│   ├── schema.prisma          # Single source of truth for DB models
│   └── migrations/            # Migration history
├── scripts/
│   └── deploy-prod.sh         # Server-side deploy script (git pull → npm ci → build → pm2 restart)
├── src/
│   ├── app/
│   │   ├── (auth)/            # Route group — login, signup pages
│   │   ├── (dashboard)/       # Route group — buyer/seller dashboard pages
│   │   ├── admin/             # Admin-only pages (listings moderation, order management)
│   │   ├── api/               # API route handlers
│   │   │   ├── auth/          # NextAuth catch-all handler
│   │   │   ├── internal/      # Internal cron endpoints (release-seller-transfers)
│   │   │   ├── uploads/       # Dev: serves images from public/uploads
│   │   │   └── webhooks/      # Shippo tracking webhooks
│   │   ├── actions/           # Server Actions (all mutations live here)
│   │   ├── browse/            # Public listing browse + search
│   │   ├── buy/               # Checkout and success pages
│   │   ├── cart/              # Shopping cart
│   │   ├── favorites/         # Saved/favorited listings
│   │   ├── listings/[id]/     # Listing detail page
│   │   ├── messages/          # Buyer-seller messaging
│   │   ├── policies/          # Static policy page
│   │   ├── sell/              # Seller portal + Stripe onboarding
│   │   ├── sellers/[id]/      # Public seller profile
│   │   └── page.tsx           # Homepage (hero, trending, new in, featured sellers)
│   ├── auth.ts                # NextAuth config (callbacks, session shape)
│   ├── components/            # Shared UI components
│   ├── lib/                   # Singleton service clients and pure utilities
│   └── types/                 # TypeScript type definitions
├── next.config.ts             # S3 image domains, server action size, rewrites
├── package.json               # name: "modaire"
└── tsconfig.json
```

---

## Feature Map

| Feature | Status | Key Files |
|---|---|---|
| Email/OTP signup | Complete | `actions/auth.ts`, `lib/email.ts` |
| Login / session | Complete | `auth.ts`, `(auth)/login/` |
| Browse + filter | Complete | `browse/page.tsx`, `lib/listingFilters.ts` |
| Global search | Complete | `browse/page.tsx` (seller name match → redirect) |
| Listing detail | Complete | `listings/[id]/page.tsx` |
| Favorites / wishlist | Complete | `actions/favorites.ts`, `favorites/page.tsx` |
| Cart | Complete | `actions/cart.ts`, `cart/page.tsx` |
| Checkout (Stripe) | Complete | `actions/checkout.ts`, `buy/checkout/` |
| Shipping rates (Shippo) | Complete | `lib/shippo.ts`, `actions/checkout.ts` |
| Order & label flow | Complete | `actions/orders.ts`, `buy/success/` |
| Shippo webhook tracking | Complete | `api/webhooks/shippo/route.ts` |
| Seller onboarding (Stripe) | Complete | `actions/stripe.ts`, `sell/onboarding-complete/` |
| Listing creation + images | Complete | `actions/listings.ts`, `lib/s3.ts` |
| Listing moderation | Complete | `actions/admin.ts`, `admin/listings/` |
| Payout hold + release | Complete | `lib/seller-transfer-release.ts`, `api/internal/` |
| Seller dashboard | Complete | `(dashboard)/dashboard/sales/` |
| Buyer purchase history | Complete | `(dashboard)/dashboard/purchases/` |
| Earnings dashboard | Partial | `(dashboard)/dashboard/earnings/` |
| Seller reviews | Complete | `actions/seller-reviews.ts` |
| Messaging (conversations) | Partial | `actions/messages.ts`, `messages/` |
| Seller profile page | Complete | `sellers/[id]/page.tsx` |
| Admin orders | Partial | `admin/orders/page.tsx` |
| Recently viewed (cookie) | Complete | `lib/recently-viewed.ts` |
| Email notifications | Complete | `lib/email.ts` (6 email types) |
| Profile settings | Present | `(dashboard)/dashboard/settings/` |
| Support page | Stub | `(dashboard)/dashboard/support/` |

---

## Database Summary

**Database:** PostgreSQL via Prisma 7 with `@prisma/adapter-pg`.

### Models

#### `User`
Central entity. Every account starts here. Doubles as seller record when `seller_enabled = true`.

| Field | Purpose |
|---|---|
| `email` | Unique login identifier |
| `password` | bcrypt hash |
| `stripe_customer_id` | Stripe Customer for saved payment methods |
| `stripe_account_id` | Stripe Express account for payouts |
| `seller_enabled` | Gate for listing creation and checkout |
| `is_admin` | Admin flag checked fresh from DB on every JWT refresh |
| `is_disabled` | Blocks login when `true` |
| Address fields | Seller ship-from address for Shippo label generation |

#### `Listing`
A garment for sale.

| Field | Purpose |
|---|---|
| `status` | `AVAILABLE` / `SOLD` |
| `moderation_status` | `PENDING` / `APPROVED` / `REJECTED` — gates browse visibility |
| `price` | `Decimal` (converted to `Number` at serialization boundary) |
| `view_count` | Incremented on page load; powers "Trending" sort |
| `image_url` | Primary image (first gallery image) |

Indexes on: `(status, moderation_status, created_at)`, `(style, category, subcategory, type)`, `size`, `price`.

#### `ListingImage`
Gallery images per listing. Three sizes stored: `imageUrl` (original), `mediumUrl` (800px webp), `thumbUrl` (300px webp). Unique on `(listingId, imageOrder)`.

#### `PendingUser`
Temporary record during email verification. Stores `verification_code_hash` (bcrypt), `code_expiry`, attempt/resend counters. Deleted once `User` is created.

#### `Purchase`
Immutable sale record. Created after Stripe checkout succeeds. Unique on `stripe_session_id` and `payment_intent_id`.

#### `Order`
Mutable fulfillment record (1:1 with `Purchase`). Tracks the full lifecycle:

```
Shipping stage:  ADDRESS_MISSING → ADDRESS_SET → OPTION_SELECTED → LABEL_PURCHASED
Shipping status: NOT_SHIPPED → PROCESSING → SHIPPED → DELIVERED
Payment status:  PENDING → PAID → FULFILLED → CANCELLED / REFUNDED
Payout status:   PENDING_HOLD → RELEASED / FAILED
```

`hold_until` = `delivered_at + 3 days`. Cron releases Stripe transfer when `hold_until ≤ now`.

#### Other models

| Model | Purpose |
|---|---|
| `CartItem` | Transient bag; items removed when listing sold |
| `FavoriteItem` | Wishlist — unique per `(user_id, listing_id)` |
| `SellerReview` | Rating 1–5 + optional text; unique per `(seller_id, reviewer_id)` |
| `Conversation` | Thread between buyer + seller; unique per `(buyer_id, seller_id)` |
| `ConversationMessage` | Individual messages; cascade-deletes with conversation |

---

## Key Flows

### 1. Signup → Verified Account
```
User fills form → startSignup() creates PendingUser → OTP email sent
→ verifyEmail() checks code (5 attempts, 10-min TTL)
→ User created in DB → PendingUser deleted → redirect to /login
```

### 2. Seller Onboarding
```
User visits /sell → onboardSellerAction() creates Stripe Express account
→ Account link sent to user → User completes Stripe KYC
→ /sell/onboarding-complete polls checkStripeAccountStatus()
→ seller_enabled = true once details_submitted + payouts_enabled + capabilities active
```

### 3. Listing Creation
```
Seller submits form + images → validateListingTaxonomy()
→ Sharp generates thumb (300px) + medium (800px) webp
→ Upload to S3 (or public/ in dev)
→ Listing + ListingImages created (moderation_status = PENDING)
→ Admin approves/rejects via /admin/listings
→ Approved listings appear in browse
```

### 4. Buyer Checkout
```
Add to bag → Cart → Single item checkout → Shipping address form
→ getShippingRatesForListing() fetches Shippo rates
→ Buyer selects rate → createCheckoutSessionWithShipping()
→ Stripe Checkout (item line + shipping line, automatic tax)
→ Stripe redirects to /buy/success?session_id=...
→ purchaseShippingLabel() buys Shippo label for seller
→ Purchase + Order created → emails sent to buyer + seller
```

### 5. Post-Sale Fulfillment
```
Seller downloads label from email link or sales dashboard
→ Ships parcel
→ Shippo webhook (track_updated) → updates shipping_status
→ On DELIVERED: sets delivered_at, hold_until = +3 days
→ Buyer + seller receive delivery emails
→ Cron: POST /api/internal/release-seller-transfers
→ Stripe transfer to seller Express account
→ Order seller_transfer_status = RELEASED
```

### 6. Shipping Address (Post-Checkout)
If buyer doesn't provide address at checkout (edge case):
```
Purchases page prompts for address → completeOrderWithAddress()
→ getShippingRatesForOrder() → selectShippingRateForOrder()
→ purchaseShippingLabel() (same as normal flow, triggered manually)
```

---

## Integration Map

### Stripe
- **Mode:** Test (`sk_test_...`). Switch to live keys for production.
- **Connect Express:** Seller onboarding, KYC, payouts.
- **Checkout Sessions:** Per-listing checkout with automatic tax.
- **Transfers:** Platform creates transfer to Express account after payout hold.
- **Customer:** Saved per buyer for address auto-fill.
- **No webhooks:** Stripe webhook handler is absent. Order creation happens on success page load (brittle — see Risks).

### Shippo
- **Mode:** Test (`shippo_test_...`).
- **Standard parcel:** 14"×12"×5", 3 lb (hardcoded in `lib/shippo.ts`).
- **Rate fetch:** `getShipmentRates()` — returns up to 4 curated options (cheapest, fastest, 2 mid).
- **Label purchase:** `purchaseLabel(rateId)` — PDF format.
- **Webhooks:** `track_updated` event → `api/webhooks/shippo/route.ts`.
- **No webhook secret verification** — unauthenticated POST accepted.

### AWS S3
- **Dev:** Files written to `public/uploads/` and served via `/api/uploads/[filename]`.
- **Prod:** PutObject to S3; URLs built from `NEXT_PUBLIC_S3_BASE_URL` or default AWS URL.
- **No presigned URLs:** All uploads go server-side through the Server Action.
- **Deletion:** `deleteS3Directory()` used on listing deletion.

### Email (Nodemailer + Gmail SMTP)
Six transactional email types:
1. `sendVerificationEmail` — OTP code
2. `sendSaleNotificationEmail` — seller notified of sale
3. `sendOrderConfirmationEmail` — buyer order confirmation
4. `sendTrackingUpdateEmail` — tracking events (transit, failure, returned)
5. `sendDeliveryNotificationEmail` — delivery confirmation (buyer + seller)
6. Seller payout: embedded in `sendDeliveryNotificationEmail` seller variant

---

## Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB

# Auth
AUTH_SECRET=<random 32+ byte string>

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Stripe
STRIPE_SECRET_KEY=sk_test_...           # or sk_live_... in production

# Shippo
SHIPPO_API_KEY=shippo_test_...          # or shippo_live_... in production

# AWS S3
AWS_S3_BUCKET_NAME=modestvault
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
NEXT_PUBLIC_S3_BASE_URL=               # Optional: custom CDN/CloudFront URL

# Email
EMAIL_USER=you@gmail.com
EMAIL_APP_PASSWORD=<gmail app password>

# Internal cron auth
INTERNAL_CRON_SECRET=<random secret>
```

---

## Deployment Setup

### Process
```bash
npm run deploy:prod
# Internally: git pull → npm ci --legacy-peer-deps → prisma migrate deploy
#             → prisma generate → next build → pm2 restart modaire
```

### PM2
- App name: `modaire` (override with `APP_NAME=...`)
- Process: `npm run start` → `next start` (default port 3000)
- `pm2 save` called after restart

### Nginx (assumed, not in repo)
- Nginx reverse proxy expected on port 80/443 → localhost:3000
- SSL termination at Nginx level assumed

### Port
- Default Next.js port 3000. `deploy-prod.sh` health-checks `http://127.0.0.1:3000`.

---

## Known Risks and Issues

### Critical

**1. No Stripe Webhook — Order Creation on Success Page Load**
`/buy/success/page.tsx` creates the `Purchase` and `Order` on page load after Stripe redirect. If the user closes the tab before the page fully loads, no order is created. Standard pattern is to create the order from a `checkout.session.completed` Stripe webhook.
_Risk: Lost orders, unsent emails, unpurchased labels._

**2. Shippo Webhook Has No Signature Verification**
`/api/webhooks/shippo/route.ts` accepts any POST without verifying the `shippo-webhook-token` header. Anyone can forge delivery events and trigger early seller payouts.
_Risk: Fraudulent payout triggers._

**3. Stripe Keys in Test Mode**
Both Stripe and Shippo are configured with test keys. Live keys must be rotated in before going live, and Stripe Connect onboarding must be configured for live mode.

**4. Gmail SMTP for Transactional Email**
Gmail app passwords are rate-limited and unreliable at scale. Should be migrated to a transactional provider (Resend, SendGrid, Postmark). `RESEND_API_KEY` env var exists but is unused.

### Moderate

**5. No Stripe Connect Webhook**
If a seller's Stripe Express account is deactivated, suspended, or payouts are disabled, the app won't know until the next Stripe API call. There's no `account.updated` webhook listener to reactively set `seller_enabled = false`.

**6. `is_admin` Fetched from DB on Every JWT Refresh**
`auth.ts` callback queries the DB on every token refresh to re-read `is_admin`. This adds latency and a DB hit on every authenticated request. Consider caching in the JWT with a short TTL.

**7. Hardcoded Parcel Dimensions**
`lib/shippo.ts` STANDARD_PARCEL is 14"×12"×5", 3 lb for all listings regardless of the actual item. Sellers cannot specify their own parcel size, which leads to inaccurate rate quotes and label costs.

**8. Image Upload Size Enforcement Is Client-Side Only**
The 10MB per image / 18MB total limit check in `actions/listings.ts` runs server-side, but `next.config.ts` sets `serverActions.bodySizeLimit = "20mb"` — the upper bound is tight and could be exceeded by 6 large images. No early client-side feedback before upload attempt.

**9. `buy/success` Can Create Duplicate Orders**
If the user refreshes the success page, `completeOrder()` is called again. The Stripe `session_id` unique constraint prevents duplicate `Purchase` rows, but the page logic should handle the already-created case more gracefully (it may throw and show an error instead of the confirmation UI).

### Minor

**10. Messaging UI Is Incomplete**
`actions/messages.ts` is fully implemented, but the messages pages (`/messages`, `/messages/[id]`) appear to lack real-time updates (no polling, no WebSocket). Conversations are readable but the UX for back-and-forth chat is basic.

**11. Admin Panel Has No Auth Guard in Middleware**
Admin route protection appears to be at the page/component level (checking `session.user.isAdmin`) rather than enforced in `middleware.ts`. A misconfiguration could expose admin data.

**12. `recently_viewed` Cookie Has No Integrity Check**
The cookie stores raw listing IDs as a comma-separated string. A user can manually craft this cookie to inject arbitrary IDs, which would produce Prisma queries with those IDs. The query uses `findMany({ where: { id: { in: ids } } })` which is safe (no SQL injection), but worth noting.

**13. No Rate Limiting on OTP / Auth Endpoints**
`startSignup` and `resendCode` implement their own counters (stored in DB), but there's no IP-level rate limiting on the route. Brute-force signups with different emails are unrestricted.

**14. `support/page.tsx` Is a Stub**
The support page exists in the dashboard sidebar but has no content or functionality.

**15. Earnings Dashboard Is Partial**
`/dashboard/earnings` is present but the payout transfer details, balance display, and Stripe dashboard link may not fully reflect live Connect state for all account types.

---

## Recommended Next Steps

### Immediate (Production Blockers)
1. **Add Stripe `checkout.session.completed` webhook** to reliably create orders server-side, independent of browser behavior.
2. **Add Shippo webhook signature verification** using the `shippo-webhook-token` header.
3. **Rotate to live Stripe + Shippo keys** before launch; update `.env` on server.
4. **Migrate email to Resend** — the API key var already exists in `.env`, just needs implementation in `lib/email.ts`.

### Short-Term (Pre-Launch Polish)
5. **Seller-specified parcel size** — add weight/dimensions fields to listings or seller profile for accurate shipping quotes.
6. **Stripe Connect `account.updated` webhook** — reactively disable `seller_enabled` if account goes inactive.
7. **Deduplicate success page** — add idempotency guard so refreshing `/buy/success` after order creation shows confirmation rather than error.
8. **Add `middleware.ts` admin route guard** — protect `/admin/*` at the middleware level, not just in page components.

### Medium-Term (Feature Completeness)
9. **Real-time messaging** — add polling or SSE to the messages UI so conversations feel live.
10. **Buyer review prompt** — trigger a `SellerReview` prompt email 3–5 days after delivery; currently no nudge exists.
11. **Notification center** — in-app notification bell for order updates, messages, review prompts.
12. **Return/refund flow** — `REFUNDED` and `RETURNED` order statuses exist in the schema but no UI or flow handles them.
13. **Admin dashboard expansion** — user management, revenue reporting, dispute resolution tools.

### Infrastructure
14. **Connection pooler** — add PgBouncer or Supabase pooler in front of PostgreSQL for production scale; Prisma's `@prisma/adapter-pg` supports it.
15. **CloudFront CDN** — route S3 image URLs through CloudFront for caching and lower latency; `NEXT_PUBLIC_S3_BASE_URL` is already wired for this.
16. **Cron job** — `/api/internal/release-seller-transfers` is called hourly via a GitHub Actions workflow, with `INTERNAL_CRON_SECRET` stored as a GitHub environment variable. ✓ Already configured.
