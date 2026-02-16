import { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  PaymentElement,
  useStripe,
  useElements,
  Elements,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { useNamespaceStore } from "@/stores/namespaceStore";
import { useTheme } from "@/hooks/useTheme";
import { stripePromise } from "@/lib/stripe";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  Shield,
  Lock,
  CreditCard,
  Zap,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { handleApiError } from "@/lib/api";
import {
  getSubscription,
  createSubscriptionIntent,
  verifyPayment,
} from "@/lib/server/billing";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  validateSearch: (search: Record<string, unknown>) => ({
    plan: (search.plan as "hobby" | "team") || "hobby",
  }),
});


interface PlanDetails {
  id: "hobby" | "team";
  name: string;
  price: string;
  priceAmount: number;
  description: string;
  icon: React.ReactNode;
}

const PLAN_DETAILS: Record<"hobby" | "team", PlanDetails> = {
  hobby: {
    id: "hobby",
    name: "Hobby",
    price: "€10/month",
    priceAmount: 10,
    description: "Perfect for solo developers",
    icon: <Zap className="h-5 w-5" />,
  },
  team: {
    id: "team",
    name: "Team",
    price: "€50/month",
    priceAmount: 50,
    description: "For growing teams",
    icon: <Users className="h-5 w-5" />,
  },
};

function PaymentForm({
  plan,
  onSuccess,
  organizationId,
}: {
  plan: PlanDetails;
  onSuccess: () => void;
  organizationId: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/settings?checkout=success`,
        },
        redirect: "if_required",
      });

      if (stripeError) {
        setError(stripeError.message || "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      // Verify payment status with backend to ensure invoice is paid
      // This ensures the subscription becomes active even if Stripe hasn't processed it yet
      try {
        const verifyResponse = await verifyPayment({ data: { organizationId } });

        if (verifyResponse.requiresAction) {
          setError(
            "Payment requires additional authentication. Please complete the verification."
          );
          setIsProcessing(false);
          return;
        }

        if (verifyResponse.status !== "active" && verifyResponse.status !== "trialing") {
          // Payment might still be processing
          if (verifyResponse.paymentIntentStatus === "processing") {
            setError(
              "Payment is still processing. Your subscription will be activated shortly."
            );
            setIsProcessing(false);
            return;
          }
          // Log warning but continue - webhook will update status
          console.warn("Subscription not yet active:", verifyResponse);
        }
      } catch (verifyError) {
        // If verification fails, log but don't block - webhook will handle it
        console.error("Failed to verify payment:", verifyError);
      }

      setIsComplete(true);
      setTimeout(onSuccess, 2000);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsProcessing(false);
    }
  };

  if (isComplete) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
        <p className="text-muted-foreground mb-4">
          Your subscription is now active. Thank you for your purchase!
        </p>
        <p className="text-sm text-muted-foreground">
          Redirecting to settings...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Payment Element Container */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CreditCard className="h-4 w-4" />
          <span>Payment Information</span>
        </div>

        <div className="bg-background border border-border rounded-xl p-6">
          <PaymentElement
            options={{
              layout: {
                type: "tabs",
                defaultCollapsed: false,
              },
            }}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-4 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        size="lg"
        className="w-full h-12 text-base"
        disabled={!stripe || !elements || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="h-5 w-5 mr-2" />
            Pay {plan.price}
          </>
        )}
      </Button>

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-4 w-4" />
        <span>Secured by Stripe. Your payment information is encrypted.</span>
      </div>
    </form>
  );
}

function CheckoutContent({
  plan,
  organizationId,
}: {
  plan: PlanDetails;
  organizationId: string;
}) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intentCreatedRef = useRef(false);

  const elementsOptions: StripeElementsOptions = useMemo(() => ({
    clientSecret: clientSecret || "",
    appearance: {
      theme: theme === "dark" ? "night" : "stripe",
      variables: {
        colorPrimary: "#6366f1",
        colorBackground: theme === "dark" ? "#0a0a0f" : "#ffffff",
        colorText: theme === "dark" ? "#f8fafc" : "#0f172a",
        colorDanger: "#ef4444",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        borderRadius: "8px",
        spacingUnit: "4px",
      },
      rules: {
        ".Input": {
          border: theme === "dark" ? "1px solid #27272a" : "1px solid #e4e4e7",
          boxShadow: "none",
          padding: "12px",
        },
        ".Input:focus": {
          border: "1px solid #6366f1",
          boxShadow: "0 0 0 1px #6366f1",
        },
        ".Label": {
          fontWeight: "500",
          marginBottom: "8px",
        },
        ".Tab": {
          border: theme === "dark" ? "1px solid #27272a" : "1px solid #e4e4e7",
          borderRadius: "8px",
        },
        ".Tab--selected": {
          border: "1px solid #6366f1",
          backgroundColor: theme === "dark" ? "#1e1b4b" : "#eef2ff",
        },
      },
    },
  }), [clientSecret, theme]);

  useEffect(() => {
    if (intentCreatedRef.current) {
      return;
    }

    const createIntent = async () => {
      intentCreatedRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const response = await createSubscriptionIntent({
          data: {
            organizationId,
            planId: plan.id,
          },
        });

        setClientSecret(response.clientSecret);
      } catch (err) {
        setError(handleApiError(err));
        intentCreatedRef.current = false;
      } finally {
        setIsLoading(false);
      }
    };

    createIntent();
  }, [organizationId, plan.id]);

  const handleSuccess = () => {
    navigate({ to: "/settings", search: { tab: "billing", checkout: "success" } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Preparing checkout...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-6 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Button variant="outline" onClick={() => navigate({ to: "/upgrade" })}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (!clientSecret) {
    return null;
  }

  return (
    <Elements stripe={stripePromise} options={elementsOptions} key={clientSecret}>
      <PaymentForm
        plan={plan}
        onSuccess={handleSuccess}
        organizationId={organizationId}
      />
    </Elements>
  );
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { plan } = Route.useSearch();
  const { currentNamespace } = useNamespaceStore();
  const organization = currentNamespace?.organization;

  const planDetails = PLAN_DETAILS[plan];

  const { data: subscriptionData } = useQuery({
    queryKey: ["subscription", organization?.id],
    queryFn: () => getSubscription({ data: { organizationId: organization!.id } }),
    enabled: !!organization?.id,
  });

  // Redirect if already subscribed
  useEffect(() => {
    if (subscriptionData?.plan.isPaid) {
      navigate({ to: "/settings", search: { tab: "billing" } });
    }
  }, [subscriptionData, navigate]);

  if (!organization) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-6 text-center">
          <p className="text-amber-800 dark:text-amber-200">
            Please select an organization to proceed with checkout.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={() => navigate({ to: "/upgrade" })}
        className="mb-8"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Plans
      </Button>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Order Summary - Left Side */}
        <div className="lg:col-span-2">
          <div className="sticky top-8">
            <div className="bg-card border border-border rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-6">Order Summary</h2>

              {/* Plan Details */}
              <div className="flex items-start gap-4 pb-6 border-b border-border">
                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                  {planDetails.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{planDetails.name} Plan</h3>
                  <p className="text-sm text-muted-foreground">
                    {planDetails.description}
                  </p>
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="py-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {planDetails.name} Plan (monthly)
                  </span>
                  <span>€{planDetails.priceAmount}</span>
                </div>
              </div>

              {/* Total */}
              <div className="pt-4 border-t border-border">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold">Total</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold">€{planDetails.priceAmount}</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="mt-6 flex flex-wrap gap-4 justify-center">
              <Badge variant="outline" className="gap-1">
                <Shield className="h-3 w-3" />
                SSL Encrypted
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3 w-3" />
                PCI Compliant
              </Badge>
            </div>
          </div>
        </div>

        {/* Payment Form - Right Side */}
        <div className="lg:col-span-3">
          <div className="bg-card border border-border rounded-2xl p-8">
            <h2 className="text-xl font-semibold mb-2">Payment Details</h2>
            <p className="text-muted-foreground mb-8">
              Enter your payment information to complete your subscription
            </p>

            <CheckoutContent plan={planDetails} organizationId={organization.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
