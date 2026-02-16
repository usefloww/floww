/**
 * Background Jobs
 *
 * Job definitions and worker setup using Graphile Worker.
 * Replaces APScheduler from Python.
 */

import type { Task, WorkerUtils } from 'graphile-worker';

// Define our own CronJob type since graphile-worker's CronItem has different structure
export interface CronJob {
  task: string;
  pattern: string;
}
import { getDb } from '../db';
import { cleanupExpiredDeviceCodes } from '../services/device-code-service';
import { cleanupRevokedTokens } from '../services/refresh-token-service';
import { eq, lt, and } from 'drizzle-orm';
import { runtimes, executionLogs } from '../db/schema';
import { logger } from '~/server/utils/logger';

/**
 * Job task definitions
 */

// Cleanup expired device codes - runs every 5 minutes
export const cleanupDeviceCodes: Task = async (_payload, _helpers) => {
  const deleted = await cleanupExpiredDeviceCodes();
  logger.info('Cleaned up expired device codes', { count: deleted });
};

// Cleanup revoked refresh tokens - runs every hour
export const cleanupRefreshTokens: Task = async (_payload, _helpers) => {
  const deleted = await cleanupRevokedTokens();
  logger.info('Cleaned up revoked refresh tokens', { count: deleted });
};

// Cleanup old execution logs - runs daily
export const cleanupExecutionLogs: Task = async (_payload, _helpers) => {
  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await db.delete(executionLogs).where(lt(executionLogs.timestamp, thirtyDaysAgo));

  logger.info('Cleaned up old execution logs', { count: result.length });
};

// Cleanup unused runtimes - runs every 6 hours
export const cleanupUnusedRuntimes: Task = async (_payload, _helpers) => {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Find runtimes that haven't been used in 7 days (based on creation date as proxy)
  // and are marked as failed or in-progress for too long
  const unused = await db
    .select()
    .from(runtimes)
    .where(and(
      lt(runtimes.createdAt, sevenDaysAgo),
      eq(runtimes.creationStatus, 'FAILED')
    ));

  for (const runtime of unused) {
    // Mark for removal
    await db
      .update(runtimes)
      .set({ creationStatus: 'REMOVED' })
      .where(eq(runtimes.id, runtime.id));
  }

  logger.info('Marked unused runtimes for removal', { count: unused.length });
};

// Send webhook retry - triggered on failure
export const webhookRetry: Task = async (payload, helpers) => {
  const { webhookId, url, body, attempt } = payload as {
    webhookId: string;
    url: string;
    body: Record<string, unknown>;
    attempt: number;
  };

  logger.info('Retrying webhook', { webhookId, attempt });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    logger.info('Webhook succeeded', { webhookId, attempt });
  } catch (error) {
    if (attempt < 5) {
      // Schedule retry with exponential backoff
      const delay = Math.pow(2, attempt) * 60; // 2, 4, 8, 16 minutes
      const payloadObj = payload as Record<string, unknown>;
      await helpers.addJob(
        'webhookRetry',
        { ...payloadObj, attempt: attempt + 1 },
        { runAt: new Date(Date.now() + delay * 1000) }
      );
    } else {
      logger.error('Webhook failed after max attempts', { webhookId, attempt });
    }
  }
};

// Process billing events - triggered by Stripe webhooks
export const processBillingEvent: Task = async (payload, _helpers) => {
  const { eventType, eventData, stripeEventId } = payload as {
    eventType: string;
    eventData: Record<string, unknown>;
    stripeEventId: string;
  };

  logger.info('Processing billing event', { eventType, stripeEventId });

  // Import billing service handlers dynamically to avoid circular deps
  const { handleCheckoutCompleted, handleSubscriptionUpdated, handlePaymentFailed } = await import(
    '../services/billing-service'
  );

  switch (eventType) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(eventData, stripeEventId);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(eventData, stripeEventId);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(eventData, stripeEventId);
      break;
    default:
      logger.debug('Unhandled billing event type', { eventType });
  }
};

// Sync triggers for a workflow - triggered on deploy
export const syncWorkflowTriggers: Task = async (payload, _helpers) => {
  const { workflowId, namespaceId, triggersMetadata } = payload as {
    workflowId: string;
    namespaceId: string;
    triggersMetadata: Array<{
      providerType: string;
      providerAlias: string;
      triggerType: string;
      input: Record<string, unknown>;
    }>;
  };

  logger.info('Syncing triggers for workflow', { workflowId, namespaceId });

  const { syncTriggers } = await import('../services/trigger-service');
  await syncTriggers(workflowId, namespaceId, triggersMetadata);
};

// Execute scheduled trigger (cron)
export const executeScheduledTrigger: Task = async (payload, _helpers) => {
  const { triggerId, cronExpression, scheduledTime, executionId } = payload as {
    triggerId: string;
    cronExpression: string;
    scheduledTime: string;
    executionId: string;
  };

  logger.info('Executing scheduled trigger', { triggerId, cronExpression, executionId });

  const { executeCronTrigger } = await import('../services/trigger-execution-service');
  await executeCronTrigger(triggerId, cronExpression, new Date(scheduledTime), executionId);
};

/**
 * All task definitions
 */
export const taskList: Record<string, Task> = {
  cleanupDeviceCodes,
  cleanupRefreshTokens,
  cleanupExecutionLogs,
  cleanupUnusedRuntimes,
  webhookRetry,
  processBillingEvent,
  syncWorkflowTriggers,
  executeScheduledTrigger,
};

/**
 * Cron job definitions (recurring tasks)
 */
export const cronJobs: CronJob[] = [
  {
    task: 'cleanupDeviceCodes',
    pattern: '*/5 * * * *', // Every 5 minutes
  },
  {
    task: 'cleanupRefreshTokens',
    pattern: '0 * * * *', // Every hour
  },
  {
    task: 'cleanupExecutionLogs',
    pattern: '0 3 * * *', // Daily at 3 AM
  },
  {
    task: 'cleanupUnusedRuntimes',
    pattern: '0 */6 * * *', // Every 6 hours
  },
];

/**
 * Schedule a one-time job
 */
export async function scheduleJob(
  utils: WorkerUtils,
  taskName: keyof typeof taskList,
  payload: Record<string, unknown>,
  options?: { runAt?: Date; maxAttempts?: number }
): Promise<void> {
  await utils.addJob(taskName, payload, {
    runAt: options?.runAt,
    maxAttempts: options?.maxAttempts ?? 3,
  });
}

/**
 * Schedule a recurring cron trigger job
 */
export async function scheduleCronTrigger(
  utils: WorkerUtils,
  triggerId: string,
  cronExpression: string
): Promise<void> {
  // Graphile Worker handles cron via crontab file or programmatic API
  // For dynamic crons, we'd use their cron functionality
  await utils.addJob('executeScheduledTrigger', { triggerId, cronExpression });
}
