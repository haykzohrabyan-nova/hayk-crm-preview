function stripeDashboardBase(path: "payments" | "refunds"): string {
  const testMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");
  const prefix = testMode ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";
  return `${prefix}/${path}`;
}

/** Stripe Dashboard deep link for a PaymentIntent (test vs live from key prefix). */
export function stripePaymentDashboardUrl(paymentIntentId: string): string {
  return `${stripeDashboardBase("payments")}/${paymentIntentId}`;
}

/** Stripe Dashboard deep link for a Refund object (`re_…`). */
export function stripeRefundDashboardUrl(stripeRefundId: string): string {
  return `${stripeDashboardBase("refunds")}/${stripeRefundId}`;
}
