import { useMemo } from "react";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { stripePromise } from "@/lib/stripe";
import { useTheme } from "@/hooks/useTheme";

interface StripeProviderProps {
  children: React.ReactNode;
  clientSecret?: string;
}

/**
 * Stripe Elements Provider wrapper.
 * Automatically handles theme switching and provides the Elements context.
 *
 * Usage:
 * - Pass clientSecret when you have a PaymentIntent or SetupIntent
 */
export function StripeProvider({
  children,
  clientSecret,
}: StripeProviderProps) {
  const { theme } = useTheme();

  const options: StripeElementsOptions = useMemo(() => {
    const opts: StripeElementsOptions = {
      appearance: {
        theme: theme === "dark" ? "night" : "stripe",
        variables: {
          colorPrimary: "hsl(222.2, 47.4%, 11.2%)",
          colorBackground: theme === "dark" ? "hsl(222.2, 84%, 4.9%)" : "#ffffff",
          colorText: theme === "dark" ? "hsl(210, 40%, 98%)" : "hsl(222.2, 84%, 4.9%)",
          colorDanger: "hsl(0, 84.2%, 60.2%)",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          borderRadius: "8px",
        },
      },
    };

    if (clientSecret) {
      opts.clientSecret = clientSecret;
    }

    return opts;
  }, [clientSecret, theme]);

  return (
    <Elements stripe={stripePromise} options={options} key={clientSecret || "no-secret"}>
      {children}
    </Elements>
  );
}

