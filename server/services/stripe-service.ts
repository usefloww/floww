/**
 * Stripe Service
 *
 * Handles Stripe API integration for subscriptions, payments, and customer management.
 */

import Stripe from 'stripe';
import { settings } from '~/server/settings';

// Initialize Stripe client
const stripeSecretKey = settings.stripe.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export type SubscriptionTier = 'FREE' | 'HOBBY' | 'TEAM';

function getStripe(): Stripe {
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
  }
  return stripe;
}

function getPriceIdForTier(tier: SubscriptionTier): string {
  if (tier === 'HOBBY') {
    const priceId = settings.stripe.STRIPE_PRICE_ID_HOBBY;
    if (!priceId) {
      throw new Error('STRIPE_PRICE_ID_HOBBY is not configured');
    }
    return priceId;
  }
  if (tier === 'TEAM') {
    const priceId = settings.stripe.STRIPE_PRICE_ID_TEAM;
    if (!priceId) {
      throw new Error('STRIPE_PRICE_ID_TEAM is not configured');
    }
    return priceId;
  }
  throw new Error(`No price ID for tier: ${tier}`);
}

/**
 * Get or create a Stripe customer for an organization
 */
export async function getOrCreateCustomer(
  organizationId: string,
  organizationName: string,
  subscriptionId: string,
  existingCustomerId?: string | null
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const stripeClient = getStripe();

  const customer = await stripeClient.customers.create({
    name: organizationName,
    metadata: {
      organization_id: organizationId,
      subscription_id: subscriptionId,
    },
  });

  return customer.id;
}

/**
 * Create a subscription with payment intent
 */
export async function createSubscriptionWithIntent(
  organizationId: string,
  organizationName: string,
  subscriptionId: string,
  existingCustomerId: string | null,
  targetTier: SubscriptionTier
): Promise<{ subscriptionId: string; clientSecret: string }> {
  const stripeClient = getStripe();
  const priceId = getPriceIdForTier(targetTier);

  const customerId = await getOrCreateCustomer(
    organizationId,
    organizationName,
    subscriptionId,
    existingCustomerId
  );

  // Check for existing incomplete subscription to reuse
  const existingSub = await findIncompleteSubscription(customerId, priceId);
  if (existingSub) {
    const clientSecret = extractClientSecret(existingSub);
    if (clientSecret) {
      return {
        subscriptionId: existingSub.id,
        clientSecret,
      };
    }
    // Cancel unusable incomplete subscription
    try {
      await stripeClient.subscriptions.cancel(existingSub.id);
    } catch {
      // Ignore errors
    }
  }

  const subscription = await stripeClient.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    collection_method: 'charge_automatically',
    metadata: {
      organization_id: organizationId,
      subscription_id: subscriptionId,
      tier: targetTier,
    },
    expand: ['latest_invoice.confirmation_secret'],
  });

  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
  const confirmationSecret = (latestInvoice as unknown as { confirmation_secret?: { client_secret?: string } })?.confirmation_secret;
  const clientSecret = confirmationSecret?.client_secret;

  if (!clientSecret) {
    throw new Error('No client_secret found on payment intent');
  }

  return {
    subscriptionId: subscription.id,
    clientSecret,
  };
}

async function findIncompleteSubscription(
  customerId: string,
  priceId: string
): Promise<Stripe.Subscription | null> {
  const stripeClient = getStripe();

  try {
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customerId,
      status: 'incomplete',
      expand: ['data.latest_invoice.payment_intent'],
    });

    for (const sub of subscriptions.data) {
      for (const item of sub.items.data) {
        if (item.price.id === priceId) {
          return sub;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function extractClientSecret(subscription: Stripe.Subscription): string | null {
  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
  if (!latestInvoice) {
    return null;
  }

  const confirmationSecret = (latestInvoice as unknown as { confirmation_secret?: { client_secret?: string } })?.confirmation_secret;
  return confirmationSecret?.client_secret ?? null;
}

/**
 * Verify a subscription's payment status
 */
export async function verifySubscriptionPayment(stripeSubscriptionId: string): Promise<{
  status: string;
  subscriptionId: string;
  message: string;
  invoiceStatus?: string;
  paymentIntentStatus?: string;
  requiresAction?: boolean;
}> {
  const stripeClient = getStripe();

  const subscription = await stripeClient.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['latest_invoice.payment_intent'],
  });

  if (subscription.status === 'active') {
    return {
      status: 'active',
      subscriptionId: subscription.id,
      message: 'Subscription is active',
    };
  }

  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
  const invoiceStatus = latestInvoice?.status;

  if (invoiceStatus === 'paid') {
    return {
      status: subscription.status,
      subscriptionId: subscription.id,
      invoiceStatus,
      message: 'Invoice is paid',
    };
  }

  const paymentIntent = (latestInvoice as unknown as { payment_intent?: Stripe.PaymentIntent })?.payment_intent ?? null;
  const piStatus = paymentIntent?.status;

  if (invoiceStatus === 'open' && piStatus === 'succeeded') {
    // Try to pay the invoice
    if (latestInvoice) {
      await stripeClient.invoices.pay(latestInvoice.id);
    }
    return {
      status: subscription.status,
      subscriptionId: subscription.id,
      invoiceStatus: 'paid',
      paymentIntentStatus: piStatus,
      message: 'Invoice paid successfully',
    };
  }

  if (piStatus === 'requires_action') {
    return {
      status: 'incomplete',
      subscriptionId: subscription.id,
      invoiceStatus: invoiceStatus ?? undefined,
      paymentIntentStatus: piStatus,
      message: 'Payment requires additional authentication',
      requiresAction: true,
    };
  }

  if (piStatus === 'processing') {
    return {
      status: 'incomplete',
      subscriptionId: subscription.id,
      invoiceStatus: invoiceStatus ?? undefined,
      paymentIntentStatus: piStatus,
      message: 'Payment is still processing',
    };
  }

  return {
    status: subscription.status,
    subscriptionId: subscription.id,
    invoiceStatus: invoiceStatus ?? undefined,
    message: `Invoice status: ${invoiceStatus}`,
  };
}

/**
 * Create a customer portal session for billing management
 */
export function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const stripeClient = getStripe();

  return stripeClient.billingPortal.sessions
    .create({
      customer: customerId,
      return_url: returnUrl,
    })
    .then((session) => ({ url: session.url! }));
}

/**
 * Cancel a subscription at period end
 */
export async function cancelSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripeClient = getStripe();

  await stripeClient.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Construct and verify a Stripe webhook event
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripeClient = getStripe();
  const webhookSecret = settings.stripe.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return stripeClient.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Find a subscription by organization ID
 */
export async function findSubscriptionByOrganization(
  organizationId: string
): Promise<Stripe.Subscription | null> {
  const stripeClient = getStripe();

  try {
    const customers = await stripeClient.customers.search({
      query: `metadata["organization_id"]:"${organizationId}"`,
    });

    if (!customers.data.length) {
      return null;
    }

    const customer = customers.data[0];
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 1,
    });

    return subscriptions.data[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the default payment method for a customer
 */
export async function getDefaultPaymentMethod(
  customerId: string
): Promise<{
  paymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null> {
  const stripeClient = getStripe();

  try {
    const customer = await stripeClient.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    }) as Stripe.Customer;

    const defaultPm = customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null;
    if (!defaultPm) {
      return null;
    }

    const card = defaultPm.card;
    if (!card) {
      return null;
    }

    return {
      paymentMethodId: defaultPm.id,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
    };
  } catch {
    return null;
  }
}

/**
 * List customer invoices
 */
export async function listCustomerInvoices(
  customerId: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  number: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string | null;
  created: number;
  periodStart: number;
  periodEnd: number;
  pdfUrl: string | null;
  hostedInvoiceUrl: string | null;
}>> {
  const stripeClient = getStripe();

  try {
    const invoices = await stripeClient.invoices.list({
      customer: customerId,
      limit,
    });

    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amountDue: inv.amount_due,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      created: inv.created,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      pdfUrl: inv.invoice_pdf ?? null,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Set default payment method if none is set
 */
export async function setDefaultPaymentMethodIfNone(
  customerId: string,
  stripeSubscriptionId: string
): Promise<boolean> {
  const stripeClient = getStripe();

  try {
    const customer = await stripeClient.customers.retrieve(customerId) as Stripe.Customer;
    const defaultPm = customer.invoice_settings?.default_payment_method;

    if (defaultPm) {
      return false;
    }

    const subscription = await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
    const paymentMethodId = subscription.default_payment_method;

    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return false;
    }

    await stripeClient.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    return true;
  } catch {
    return false;
  }
}
