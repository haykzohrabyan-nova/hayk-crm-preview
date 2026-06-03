import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  // Reject publishable keys accidentally pasted into STRIPE_SECRET_KEY
  if (key.startsWith("pk_")) return null;
  return key;
}

export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (!stripeClient) {
    // Fetch client avoids Node https issues on some serverless runtimes (Vercel/edge-adjacent).
    stripeClient = new Stripe(key, {
      httpClient: Stripe.createFetchHttpClient(),
      timeout: 20_000,
      maxNetworkRetries: 2,
    });
  }
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!stripeSecretKey();
}
