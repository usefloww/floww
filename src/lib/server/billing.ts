import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export interface SubscriptionInfo {
  subscription: {
    id: string;
    tier: string;
    status: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
  };
  plan: {
    name: string;
    workflowLimit: number;
    executionLimitPerMonth: number;
    isPaid: boolean;
  };
  usage: {
    workflows: number;
    executionsThisMonth: number;
  };
}

export interface PaymentMethodInfo {
  paymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

/**
 * Get subscription details for an organization
 */
export const getSubscription = createServerFn({ method: 'GET' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<SubscriptionInfo> => {
    const user = await requireUser();
    const { getOrCreateSubscription, getSubscriptionDetails, getWorkflowCount, getExecutionCountThisMonth } = 
      await import('~/server/services/billing-service');
    const { getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership) {
      throw new Error('Access denied');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);
    const details = getSubscriptionDetails(subscription);

    // Get usage stats
    const workflowCount = await getWorkflowCount(data.organizationId);
    const executionCount = await getExecutionCountThisMonth(data.organizationId);

    return {
      subscription: {
        id: subscription.id,
        tier: subscription.tier,
        status: subscription.status,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      plan: {
        name: details.planName,
        workflowLimit: details.workflowLimit,
        executionLimitPerMonth: details.executionLimitPerMonth,
        isPaid: details.isPaid,
      },
      usage: {
        workflows: workflowCount,
        executionsThisMonth: executionCount,
      },
    };
  });

/**
 * Get usage statistics for an organization
 */
export const getUsage = createServerFn({ method: 'GET' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<{ workflows: number; executionsThisMonth: number }> => {
    const user = await requireUser();
    const { getWorkflowCount, getExecutionCountThisMonth } = await import('~/server/services/billing-service');
    const { getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership) {
      throw new Error('Access denied');
    }

    const workflowCount = await getWorkflowCount(data.organizationId);
    const executionCount = await getExecutionCountThisMonth(data.organizationId);

    return {
      workflows: workflowCount,
      executionsThisMonth: executionCount,
    };
  });

/**
 * Get payment method for an organization
 */
export const getPaymentMethod = createServerFn({ method: 'GET' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<PaymentMethodInfo | null> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { getDefaultPaymentMethod } = await import('~/server/services/stripe-service');
    const { getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership) {
      throw new Error('Access denied');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);
    if (!subscription.stripeCustomerId) {
      return null;
    }

    return getDefaultPaymentMethod(subscription.stripeCustomerId);
  });

/**
 * Create a subscription intent for payment
 */
export const createSubscriptionIntent = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; planId: string }) => input)
  .handler(async ({ data }): Promise<{ subscriptionId: string; clientSecret: string }> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { createSubscriptionWithIntent } = await import('~/server/services/stripe-service');
    const { getOrganization, getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check admin membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new Error('Admin access required');
    }

    const organization = await getOrganization(data.organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);

    const tier = data.planId as 'hobby' | 'team';
    const result = await createSubscriptionWithIntent(
      data.organizationId,
      organization.displayName,
      subscription.id,
      subscription.stripeCustomerId,
      tier.toUpperCase() as 'HOBBY' | 'TEAM'
    );

    return {
      subscriptionId: result.subscriptionId,
      clientSecret: result.clientSecret,
    };
  });

/**
 * Verify payment status for a subscription
 */
export const verifyPayment = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<{
    status: string;
    subscriptionId: string;
    message: string;
    invoiceStatus?: string;
    paymentIntentStatus?: string;
    requiresAction?: boolean;
  }> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { verifySubscriptionPayment } = await import('~/server/services/stripe-service');
    const { getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership) {
      throw new Error('Access denied');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new Error('No Stripe subscription found');
    }

    return verifySubscriptionPayment(subscription.stripeSubscriptionId);
  });

/**
 * Cancel a subscription
 */
export const cancelSubscription = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { cancelSubscription: cancel } = await import('~/server/services/stripe-service');
    const { getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check admin membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new Error('Admin access required');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new Error('No active subscription to cancel');
    }

    await cancel(subscription.stripeSubscriptionId);
    return { success: true };
  });

/**
 * Upgrade subscription (for team upgrades)
 */
export const upgradeSubscription = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; targetPlan: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean; newTier: string; message: string }> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { createSubscriptionWithIntent } = await import('~/server/services/stripe-service');
    const { getOrganization, getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check admin membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new Error('Admin access required');
    }

    const organization = await getOrganization(data.organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);

    // Create new subscription for the target tier
    const tier = data.targetPlan as 'hobby' | 'team';
    await createSubscriptionWithIntent(
      data.organizationId,
      organization.displayName,
      subscription.id,
      subscription.stripeCustomerId,
      tier.toUpperCase() as 'HOBBY' | 'TEAM'
    );

    return {
      success: true,
      newTier: data.targetPlan,
      message: `Successfully initiated upgrade to ${data.targetPlan} plan`,
    };
  });

/**
 * Create a billing portal session
 */
export const createPortalSession = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; returnUrl: string }) => input)
  .handler(async ({ data }): Promise<{ url: string }> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { createCustomerPortalSession } = await import('~/server/services/stripe-service');
    const { getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check admin membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new Error('Admin access required');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);
    if (!subscription.stripeCustomerId) {
      throw new Error('No billing customer found');
    }

    return createCustomerPortalSession(subscription.stripeCustomerId, data.returnUrl);
  });

export interface InvoiceInfo {
  id: string;
  number: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string | null;
  created: number;
  period_start: number | null;
  period_end: number | null;
  pdf_url: string | null;
  hosted_invoice_url: string | null;
}

/**
 * Get invoices for an organization
 */
export const getInvoices = createServerFn({ method: 'GET' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<InvoiceInfo[]> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { listCustomerInvoices } = await import('~/server/services/stripe-service');
    const { getOrganizationMembership } = await import('~/server/services/organization-service');

    // Check membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership) {
      throw new Error('Access denied');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);
    if (!subscription.stripeCustomerId) {
      return [];
    }

    const invoices = await listCustomerInvoices(subscription.stripeCustomerId, 50);
    
    return invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amount_due: inv.amountDue,
      amount_paid: inv.amountPaid,
      currency: inv.currency,
      status: inv.status,
      created: inv.created,
      period_start: inv.periodStart,
      period_end: inv.periodEnd,
      pdf_url: inv.pdfUrl,
      hosted_invoice_url: inv.hostedInvoiceUrl,
    }));
  });

export interface SetupIntentResponse {
  client_secret: string;
  setup_intent_id: string;
}

/**
 * Create a setup intent for updating payment method
 */
export const createPaymentMethodSetupIntent = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<SetupIntentResponse> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { getOrganizationMembership, getOrganization } = await import('~/server/services/organization-service');
    const { getOrCreateCustomer } = await import('~/server/services/stripe-service');
    const Stripe = (await import('stripe')).default;

    // Check admin membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new Error('Admin access required');
    }

    const organization = await getOrganization(data.organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);
    
    // Get or create Stripe customer
    const customerId = await getOrCreateCustomer(
      data.organizationId,
      organization.displayName,
      subscription.id,
      subscription.stripeCustomerId
    );

    // Create setup intent
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('Stripe is not configured');
    }
    const stripe = new Stripe(stripeSecretKey);
    
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    if (!setupIntent.client_secret) {
      throw new Error('Failed to create setup intent');
    }

    return {
      client_secret: setupIntent.client_secret,
      setup_intent_id: setupIntent.id,
    };
  });

/**
 * Confirm a setup intent and set as default payment method
 */
export const confirmPaymentMethodSetup = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; setupIntentId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { getOrCreateSubscription } = await import('~/server/services/billing-service');
    const { getOrganizationMembership } = await import('~/server/services/organization-service');
    const Stripe = (await import('stripe')).default;

    // Check admin membership
    const membership = await getOrganizationMembership(data.organizationId, user.id);
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new Error('Admin access required');
    }

    const subscription = await getOrCreateSubscription(data.organizationId);
    if (!subscription.stripeCustomerId) {
      throw new Error('No billing customer found');
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('Stripe is not configured');
    }
    const stripe = new Stripe(stripeSecretKey);

    // Retrieve the setup intent to get the payment method
    const setupIntent = await stripe.setupIntents.retrieve(data.setupIntentId);
    
    if (setupIntent.status !== 'succeeded') {
      throw new Error('Setup intent not completed');
    }

    const paymentMethodId = setupIntent.payment_method;
    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      throw new Error('No payment method found');
    }

    // Set as default payment method on customer
    await stripe.customers.update(subscription.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // If there's an active subscription, update its default payment method too
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }

    return { success: true };
  });
