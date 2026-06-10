-- Fix bundle checkout: N Purchase rows for a single bundled Stripe session
-- need to share one stripe_session_id + payment_intent_id (one Stripe session
-- pays for multiple items). The per-column @unique constraints we had before
-- made this impossible — the 2nd insert in the bundle's create-transaction
-- always violated the constraint, the transaction rolled back, and no orders
-- were created (even though Stripe successfully charged the buyer).
--
-- This swaps the per-column uniqueness for a composite uniqueness on
-- (stripe_session_id, listing_id) and (payment_intent_id, listing_id). The
-- composite key:
--   * Allows N Purchase rows per session (one per listing in the bundle).
--   * Still throws P2002 if a concurrent caller tries to create a duplicate
--     row for the same (session, listing) pair — which is what
--     finalizeCheckout's idempotency catch-handler depends on.
--
-- Safe to run on existing data: zero sessions in the DB currently have
-- multiple Purchase rows, so dropping the single-column constraint can't
-- create any orphan duplicates.
--
-- Prisma's @unique columns are implemented as standalone UNIQUE INDEXES (not
-- table constraints), so DROP INDEX is the right tool here, NOT DROP
-- CONSTRAINT.

DROP INDEX IF EXISTS "Purchase_stripe_session_id_key";
DROP INDEX IF EXISTS "Purchase_payment_intent_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_stripe_session_id_listing_id_key"
    ON "Purchase" ("stripe_session_id", "listing_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_payment_intent_id_listing_id_key"
    ON "Purchase" ("payment_intent_id", "listing_id");
