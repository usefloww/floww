import { loadStripe, type Stripe } from "@stripe/stripe-js";

interface ConfigResponse {
  stripe_publishable_key: string | null;
}

let _stripePromise: Promise<Stripe | null> | null = null;

async function fetchStripeKey(): Promise<string | null> {
  // Only fetch config on client side
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      console.warn("Failed to fetch config for Stripe key");
      return null;
    }
    const config: ConfigResponse = await response.json();
    return config.stripe_publishable_key;
  } catch (error) {
    console.warn("Failed to fetch Stripe publishable key:", error);
    return null;
  }
}

export async function getStripe(): Promise<Stripe | null> {
  // Only initialize on client side
  if (typeof window === "undefined") {
    return null;
  }

  if (!_stripePromise) {
    _stripePromise = fetchStripeKey().then((publishableKey) => {
      if (!publishableKey) {
        console.warn("Stripe publishable key not configured");
        return null;
      }
      return loadStripe(publishableKey);
    });
  }

  return _stripePromise;
}

// For synchronous access when we already have Stripe initialized
// This returns a promise that resolves to Stripe on client side
export const stripePromise = getStripe();
