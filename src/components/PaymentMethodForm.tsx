import { useState, useEffect } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, CheckCircle, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StripeProvider } from "@/components/StripeProvider";
import { handleApiError } from "@/lib/api";
import { createPaymentMethodSetupIntent, confirmPaymentMethodSetup } from "@/lib/server/billing";

interface PaymentMethodData {
  payment_method_id: string | null;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
}

interface PaymentMethodFormProps {
  organizationId: string;
  currentPaymentMethod: PaymentMethodData | null;
  onUpdate: () => void;
  onCancel: () => void;
}

function UpdatePaymentForm({
  organizationId,
  setupIntentId,
  onSuccess,
  onCancel,
}: {
  organizationId: string;
  setupIntentId: string;
  onSuccess: () => void;
  onCancel: () => void;
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
      // Confirm the SetupIntent
      const { error: stripeError } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/settings`,
        },
        redirect: "if_required",
      });

      if (stripeError) {
        setError(stripeError.message || "Failed to update payment method");
        setIsProcessing(false);
        return;
      }

      // Confirm with our backend to set as default
      await confirmPaymentMethodSetup({
        data: { organizationId, setupIntentId },
      });

      setIsComplete(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      setError(handleApiError(err));
      setIsProcessing(false);
    }
  };

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3 mb-3">
          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <p className="text-sm font-medium">Payment method updated!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-border p-4 bg-background">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !elements || isProcessing}
          className="flex-1"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Updating...
            </>
          ) : (
            "Update Card"
          )}
        </Button>
      </div>
    </form>
  );
}

export function PaymentMethodCard({
  paymentMethod,
  onUpdateClick,
}: {
  paymentMethod: PaymentMethodData | null;
  onUpdateClick: () => void;
}) {
  if (!paymentMethod || !paymentMethod.last4) {
    return (
      <div className="border border-dashed border-border rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-muted-foreground">
          <CreditCard className="h-5 w-5" />
          <span className="text-sm">No payment method on file</span>
        </div>
        <Button size="sm" variant="outline" onClick={onUpdateClick}>
          Add Card
        </Button>
      </div>
    );
  }

  const brandDisplay = paymentMethod.brand
    ? paymentMethod.brand.charAt(0).toUpperCase() + paymentMethod.brand.slice(1)
    : "Card";

  return (
    <div className="border border-border rounded-lg p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted rounded">
          <CreditCard className="h-5 w-5 text-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">
            {brandDisplay} ending in {paymentMethod.last4}
          </p>
          <p className="text-xs text-muted-foreground">
            Expires {paymentMethod.exp_month}/{paymentMethod.exp_year}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onUpdateClick}>
        Update
      </Button>
    </div>
  );
}

export function PaymentMethodForm({
  organizationId,
  currentPaymentMethod,
  onUpdate,
  onCancel,
}: PaymentMethodFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const createSetupIntent = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await createPaymentMethodSetupIntent({ data: { organizationId } });
        setClientSecret(response.client_secret);
        setSetupIntentId(response.setup_intent_id);
      } catch (err) {
        setError(handleApiError(err));
      } finally {
        setIsLoading(false);
      }
    };

    createSetupIntent();
  }, [organizationId]);

  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Update Payment Method</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {currentPaymentMethod?.last4 && (
        <div className="text-sm text-muted-foreground">
          Current card: {currentPaymentMethod.brand} ending in{" "}
          {currentPaymentMethod.last4}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {clientSecret && setupIntentId && !isLoading && !error && (
        <StripeProvider clientSecret={clientSecret}>
          <UpdatePaymentForm
            organizationId={organizationId}
            setupIntentId={setupIntentId}
            onSuccess={onUpdate}
            onCancel={onCancel}
          />
        </StripeProvider>
      )}
    </div>
  );
}

