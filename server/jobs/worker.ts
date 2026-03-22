/**
 * Graphile Worker Setup
 *
 * Initializes and runs the background job worker.
 */

import { run, Runner, makeWorkerUtils, WorkerUtils, parseCronItems } from 'graphile-worker';
import type { CronItem } from 'graphile-worker';
import { taskList, cronJobs } from './index';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';
import { getEnvWithSecret } from '~/server/utils/docker-secrets';
import { getCronItems, loadCronTriggersFromDb } from '~/server/services/cron-scheduler-service';

let workerInstance: Runner | null = null;
let workerUtils: WorkerUtils | null = null;

/**
 * Get the database connection string
 */
function getDatabaseUrl(): string {
  return settings.database.DATABASE_URL;
}

/**
 * Initialize worker utilities for adding jobs
 */
export async function initWorkerUtils(): Promise<WorkerUtils> {
  if (!workerUtils) {
    workerUtils = await makeWorkerUtils({
      connectionString: getDatabaseUrl(),
    });
  }
  return workerUtils;
}

/**
 * Get worker utilities (must be initialized first)
 */
export function getWorkerUtils(): WorkerUtils {
  if (!workerUtils) {
    throw new Error('Worker utils not initialized. Call initWorkerUtils() first.');
  }
  return workerUtils;
}

/**
 * Start the Graphile Worker
 */
export async function startWorker(): Promise<Runner> {
  if (workerInstance) {
    logger.debug('Worker already running');
    return workerInstance;
  }

  logger.info('Starting Graphile Worker...');

  // Initialize utils first
  await initWorkerUtils();

  // Convert system cron jobs into the shared parsedCronItems array
  const sharedCronItems = getCronItems();
  const systemCronItems: CronItem[] = cronJobs.map((job) => ({
    task: job.task,
    match: job.pattern,
    identifier: `system:${job.task}`,
    options: {
      backfillPeriod: 0,
      jobKey: `system:${job.task}`,
      jobKeyMode: 'replace' as const,
    },
  }));
  const parsedSystemItems = parseCronItems(systemCronItems);
  sharedCronItems.push(...parsedSystemItems);

  // Load user-defined cron triggers from the database
  await loadCronTriggersFromDb();

  // Start the worker with the shared mutable cron items array
  workerInstance = await run({
    connectionString: getDatabaseUrl(),
    taskList,
    parsedCronItems: sharedCronItems,
    concurrency: parseInt(getEnvWithSecret('WORKER_CONCURRENCY') ?? '5', 10),
    pollInterval: 1000, // Check for jobs every second
    noHandleSignals: false, // Handle SIGINT/SIGTERM
  });

  logger.info('Graphile Worker started');

  return workerInstance;
}

/**
 * Stop the worker gracefully
 */
export async function stopWorker(): Promise<void> {
  if (workerInstance) {
    logger.info('Stopping Graphile Worker...');
    await workerInstance.stop();
    workerInstance = null;
  }

  if (workerUtils) {
    await workerUtils.release();
    workerUtils = null;
  }

  logger.info('Graphile Worker stopped');
}

/**
 * Add a job to the queue
 */
export async function addJob(
  taskName: keyof typeof taskList,
  payload: Record<string, unknown> = {},
  options?: {
    runAt?: Date;
    maxAttempts?: number;
    jobKey?: string;
    priority?: number;
  }
): Promise<void> {
  const utils = await initWorkerUtils();
  await utils.addJob(taskName, payload, {
    runAt: options?.runAt,
    maxAttempts: options?.maxAttempts ?? 3,
    jobKey: options?.jobKey,
    priority: options?.priority,
  });
}

/**
 * Worker health check
 */
export function isWorkerRunning(): boolean {
  return workerInstance !== null;
}
