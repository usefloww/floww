/**
 * Subscription Routes
 *
 * GET /api/subscriptions - Get current subscription
 * POST /api/subscriptions/subscribe - Start subscription
 * POST /api/subscriptions/portal - Create billing portal session
 */

import { get, post, json, errorResponse, parseBody } from '~/server/api/router';
import * as billingService from '~/server/services/billing-service';
import * as stripeService from '~/server/services/stripe-service';
import { getOrganization, getOrganizationMembership } from '~/server/services/organization-service';
import { subscribeSchema, createPortalSessionSchema } from '~/server/api/schemas';
import { logger } from '~/server/utils/logger';

// Get current subscription
get('/subscriptions', async (ctx) => {
  const { user, query } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const organizationId = query.get('organizationId');
  if (!organizationId) {
    return errorResponse('organizationId is required', 400);
  }

  // Check membership
  const membership = await getOrganizationMembership(organizationId, user.id);
  if (!membership && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const subscription = await billingService.getOrCreateSubscription(organizationId);
  const details = billingService.getSubscriptionDetails(subscription);

  // Get usage stats
  const workflowCount = await billingService.getWorkflowCount(organizationId);
  const executionCount = await billingService.getExecutionCountThisMonth(organizationId);

  return json({
    subscription: {
      id: subscription.id,
      tier: subscription.tier,
      status: subscription.status,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
      trialEndsAt: subscription.trialEndsAt?.toISOString(),
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
  });
});

// Start subscription
post('/subscriptions/subscribe', async (ctx) => {
  const { user, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, subscribeSchema);
  if ('error' in parsed) return parsed.error;

  const { organizationId, tier } = parsed.data;

  // Check admin membership
  const membership = await getOrganizationMembership(organizationId, user.id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return errorResponse('Admin access required', 403);
  }

  const organization = await getOrganization(organizationId);
  if (!organization) {
    return errorResponse('Organization not found', 404);
  }

  const subscription = await billingService.getOrCreateSubscription(organizationId);

  try {
    const result = await stripeService.createSubscriptionWithIntent(
      organizationId,
      organization.displayName,
      subscription.id,
      subscription.stripeCustomerId,
      tier.toUpperCase() as 'HOBBY' | 'TEAM'
    );

    return json({
      subscriptionId: result.subscriptionId,
      clientSecret: result.clientSecret,
    });
  } catch (error) {
    logger.error('Subscription error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to create subscription',
      400
    );
  }
});

// Create billing portal session
post('/subscriptions/portal', async (ctx) => {
  const { user, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, createPortalSessionSchema);
  if ('error' in parsed) return parsed.error;

  const { organizationId, returnUrl } = parsed.data;

  // Check admin membership
  const membership = await getOrganizationMembership(organizationId, user.id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return errorResponse('Admin access required', 403);
  }

  const subscription = await billingService.getOrCreateSubscription(organizationId);
  if (!subscription.stripeCustomerId) {
    return errorResponse('No billing customer found', 400);
  }

  try {
    const result = await stripeService.createCustomerPortalSession(
      subscription.stripeCustomerId,
      returnUrl
    );

    return json({ url: result.url });
  } catch (error) {
    logger.error('Portal error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to create portal session',
      400
    );
  }
});

// Stripe webhook handler
post('/billing/webhook', async (ctx) => {
  const { request } = ctx;

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return errorResponse('Missing signature', 400);
  }

  try {
    const body = await request.text();
    const event = stripeService.constructWebhookEvent(body, signature);

    // Handle different event types
    const eventData = event.data.object as unknown as Record<string, unknown>;
    switch (event.type) {
      case 'checkout.session.completed':
        await billingService.handleCheckoutCompleted(eventData, event.id);
        break;
      case 'customer.subscription.created':
        await billingService.handleSubscriptionCreated(eventData, event.id);
        break;
      case 'customer.subscription.updated':
        await billingService.handleSubscriptionUpdated(eventData, event.id);
        break;
      case 'customer.subscription.deleted':
        await billingService.handleSubscriptionDeleted(eventData, event.id);
        break;
      case 'invoice.payment_failed':
        await billingService.handlePaymentFailed(eventData, event.id);
        break;
      case 'invoice.payment_succeeded':
        await billingService.handlePaymentSucceeded(eventData, event.id);
        break;
    }

    return json({ received: true });
  } catch (error) {
    logger.error('Webhook error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(
      error instanceof Error ? error.message : 'Webhook handler failed',
      400
    );
  }
}, false); // No auth required for webhooks
