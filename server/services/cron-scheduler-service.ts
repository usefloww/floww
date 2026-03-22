import type { ParsedCronItem } from 'graphile-worker';
import { parseCronItem } from 'graphile-worker';
import { eq, and } from 'drizzle-orm';
import { getDb } from '~/server/db';
import { recurringTasks, triggers, workflows } from '~/server/db/schema';
import { logger } from '~/server/utils/logger';

const cronItems: ParsedCronItem[] = [];

export function getCronItems(): ParsedCronItem[] {
  return cronItems;
}

export async function loadCronTriggersFromDb(): Promise<void> {
  const db = getDb();

  const results = await db
    .select({
      triggerId: triggers.id,
      triggerInput: triggers.input,
    })
    .from(recurringTasks)
    .innerJoin(triggers, eq(recurringTasks.triggerId, triggers.id))
    .innerJoin(workflows, eq(triggers.workflowId, workflows.id))
    .where(and(eq(workflows.active, true)));

  for (const row of results) {
    const input = row.triggerInput as Record<string, unknown>;
    const expression = input.expression as string;

    if (!expression) {
      logger.warn('Cron trigger missing expression, skipping', { triggerId: row.triggerId });
      continue;
    }

    addCronTrigger(row.triggerId, expression);
  }

  logger.info('Loaded cron triggers from database', { count: results.length });
}

export function addCronTrigger(triggerId: string, cronExpression: string): void {
  const identifier = `cron-trigger:${triggerId}`;

  // Avoid duplicates
  const existing = cronItems.findIndex((item) => item.identifier === identifier);
  if (existing !== -1) {
    cronItems.splice(existing, 1);
  }

  const parsed = parseCronItem({
    task: 'executeScheduledTrigger',
    match: cronExpression,
    payload: { triggerId },
    identifier,
    options: {
      backfillPeriod: 0,
      jobKey: identifier,
      jobKeyMode: 'replace',
    },
  });

  cronItems.push(parsed);
  logger.debug('Added cron trigger to scheduler', { triggerId, cronExpression });
}

export function removeCronTrigger(triggerId: string): void {
  const identifier = `cron-trigger:${triggerId}`;
  const index = cronItems.findIndex((item) => item.identifier === identifier);

  if (index !== -1) {
    cronItems.splice(index, 1);
    logger.debug('Removed cron trigger from scheduler', { triggerId });
  }
}
