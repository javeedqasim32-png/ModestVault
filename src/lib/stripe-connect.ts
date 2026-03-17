import type Stripe from "stripe";

export function isStripeAccountReady(account: Stripe.Account) {
  const hasTransfers = account.capabilities?.transfers === "active";
  const hasPayments = account.capabilities?.card_payments === "active";

  return Boolean(
    account.details_submitted &&
      account.payouts_enabled &&
      hasTransfers &&
      hasPayments
  );
}
