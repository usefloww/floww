import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';
import type { SummaryResponse, ExecutionDaySummary } from '@/types/api';

/**
 * Server function to get namespace summary/statistics
 */
export const getSummary = createServerFn({ method: 'GET' })
  .inputValidator((input: { namespaceId: string } | undefined) => {
    if (!input || !input.namespaceId) {
      throw new Error('namespaceId is required');
    }
    return input;
  })
  .handler(async ({ data }): Promise<SummaryResponse> => {
    if (!data || !data.namespaceId) {
      throw new Error('namespaceId is required');
    }
    
    const user = await requireUser();
    
    // Lazy import to avoid circular dependencies
    const { eq, and, count, gte, inArray, sql } = await import('drizzle-orm');
    const { getDb } = await import('~/server/db');
    const {
      workflows,
      executionHistory,
      namespaces,
      organizationMembers,
    } = await import('~/server/db/schema');

    const db = getDb();
    const namespaceId = data.namespaceId;
    const PERIOD_DAYS = 30;

    const emptySummary: SummaryResponse = {
      executionsByDay: [],
      totalExecutions: 0,
      totalCompleted: 0,
      totalFailed: 0,
      periodDays: PERIOD_DAYS,
    };

    // Get organization for this namespace and verify access
    const namespaceResult = await db
      .select({ organizationOwnerId: namespaces.organizationOwnerId })
      .from(namespaces)
      .where(eq(namespaces.id, namespaceId))
      .limit(1);

    if (namespaceResult.length === 0) return emptySummary;

    const organizationId = namespaceResult[0].organizationOwnerId;
    if (!organizationId) return emptySummary;

    // Verify user is member of organization
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      throw new Error('Access denied');
    }

    // Get workflow IDs in this namespace
    const workflowIds = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.namespaceId, namespaceId));

    const wfIds = workflowIds.map((w) => w.id);

    if (wfIds.length === 0) return emptySummary;

    // Query executions grouped by day for the last N days
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - PERIOD_DAYS);

    const dailyRows = await db
      .select({
        date: sql<string>`date_trunc('day', ${executionHistory.receivedAt})::date::text`,
        total: count(),
        completed: sql<number>`count(*) filter (where ${executionHistory.status} = 'COMPLETED')`,
        failed: sql<number>`count(*) filter (where ${executionHistory.status} = 'FAILED')`,
        started: sql<number>`count(*) filter (where ${executionHistory.status} = 'STARTED')`,
        received: sql<number>`count(*) filter (where ${executionHistory.status} = 'RECEIVED')`,
        timeout: sql<number>`count(*) filter (where ${executionHistory.status} = 'TIMEOUT')`,
        noDeployment: sql<number>`count(*) filter (where ${executionHistory.status} = 'NO_DEPLOYMENT')`,
      })
      .from(executionHistory)
      .where(
        and(
          inArray(executionHistory.workflowId, wfIds),
          gte(executionHistory.receivedAt, periodStart)
        )
      )
      .groupBy(sql`date_trunc('day', ${executionHistory.receivedAt})::date`)
      .orderBy(sql`date_trunc('day', ${executionHistory.receivedAt})::date`);

    const executionsByDay: ExecutionDaySummary[] = dailyRows.map((row) => ({
      date: row.date,
      total: Number(row.total),
      completed: Number(row.completed),
      failed: Number(row.failed),
      started: Number(row.started),
      received: Number(row.received),
      timeout: Number(row.timeout),
      noDeployment: Number(row.noDeployment),
    }));

    const totalExecutions = executionsByDay.reduce((sum, d) => sum + d.total, 0);
    const totalCompleted = executionsByDay.reduce((sum, d) => sum + d.completed, 0);
    const totalFailed = executionsByDay.reduce((sum, d) => sum + d.failed, 0);

    return {
      executionsByDay,
      totalExecutions,
      totalCompleted,
      totalFailed,
      periodDays: PERIOD_DAYS,
    };
  });
