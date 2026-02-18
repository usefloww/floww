import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export interface ManualTriggerInfo {
  id: string;
  name: string;
  description: string | null;
  inputSchema: Record<string, any> | null;
  executionCount: number;
}

/**
 * Get manual triggers for a workflow, with execution counts
 */
export const getManualTriggers = createServerFn({ method: 'GET' })
  .inputValidator((input: { workflowId: string }) => input)
  .handler(async ({ data }): Promise<{ triggers: ManualTriggerInfo[] }> => {
    const user = await requireUser();
    const { hasWorkflowAccess } = await import('~/server/services/access-service');
    const { listTriggers } = await import('~/server/services/trigger-service');
    const { getDb } = await import('~/server/db');
    const { executionHistory } = await import('~/server/db/schema');
    const { inArray, count } = await import('drizzle-orm');

    const hasAccess = await hasWorkflowAccess(user.id, data.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const allTriggers = await listTriggers(data.workflowId);
    const manualTriggers = allTriggers.filter(t => t.triggerType === 'onManual');

    if (manualTriggers.length === 0) {
      return { triggers: [] };
    }

    // Get execution counts grouped by triggerId
    const triggerIds = manualTriggers.map(t => t.id);
    const db = getDb();
    const executionCounts = await db
      .select({
        triggerId: executionHistory.triggerId,
        count: count(),
      })
      .from(executionHistory)
      .where(inArray(executionHistory.triggerId, triggerIds))
      .groupBy(executionHistory.triggerId);

    const countMap = new Map<string, number>(
      executionCounts
        .filter((ec): ec is typeof ec & { triggerId: string } => ec.triggerId != null)
        .map(ec => [ec.triggerId, Number(ec.count)])
    );

    return {
      triggers: manualTriggers.map(t => {
        const input = (t.input as Record<string, any>) || {};
        return {
          id: t.id,
          name: input.name || 'Unnamed Trigger',
          description: input.description || null,
          inputSchema: input.inputSchema || input.input_schema || null,
          executionCount: countMap.get(t.id) || 0,
        };
      }),
    };
  });

/**
 * Invoke a manual trigger, creating an execution and running it
 */
export const invokeManualTrigger = createServerFn({ method: 'POST' })
  .inputValidator((input: { triggerId: string; inputData: Record<string, any> }) => input)
  .handler(async ({ data }): Promise<{ executionId: string; status: string }> => {
    const user = await requireUser();
    const { hasWorkflowAccess } = await import('~/server/services/access-service');
    const { getTrigger } = await import('~/server/services/trigger-service');
    const { createExecution } = await import('~/server/services/execution-service');
    const { executeManualTrigger: execute } = await import('~/server/services/trigger-execution-service');

    const trigger = await getTrigger(data.triggerId);
    if (!trigger) {
      throw new Error('Trigger not found');
    }

    const hasAccess = await hasWorkflowAccess(user.id, trigger.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const execution = await createExecution({
      workflowId: trigger.workflowId,
      triggerId: trigger.id,
      triggeredByUserId: user.id,
    });

    const result = await execute(trigger.id, data.inputData, execution.id);

    return {
      executionId: execution.id,
      status: result.status,
    };
  });
