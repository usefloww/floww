import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export interface ExecutionInfo {
  id: string;
  workflowId: string;
  triggerId: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  triggerPayload: {};
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

/**
 * Get a single execution by ID
 */
export const getExecution = createServerFn({ method: 'GET' })
  .inputValidator((input: { executionId: string }) => input)
  .handler(async ({ data }): Promise<ExecutionInfo> => {
    const user = await requireUser();
    const { getExecution: get, serializeExecution } = await import('~/server/services/execution-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const execution = await get(data.executionId);
    if (!execution) {
      throw new Error('Execution not found');
    }

    const hasAccess = await hasWorkflowAccess(user.id, execution.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const serialized = serializeExecution(execution);
    return {
      id: serialized.id as string,
      workflowId: serialized.workflowId as string,
      triggerId: (serialized.triggerId as string | null) ?? null,
      status: serialized.status as string,
      startedAt: (serialized.startedAt as string | null) ?? serialized.receivedAt as string,
      completedAt: (serialized.completedAt as string | null) ?? null,
      error: (serialized.errorMessage as string | null) ?? null,
      triggerPayload: {},
    };
  });

/**
 * List executions for a workflow
 */
export const getExecutions = createServerFn({ method: 'GET' })
  .inputValidator((input: {
    workflowId: string;
    limit?: number;
    offset?: number;
    status?: string;
  }) => input)
  .handler(async ({ data }): Promise<{ results: ExecutionInfo[]; total: number }> => {
    const user = await requireUser();
    const { listExecutions, serializeExecution } = await import('~/server/services/execution-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const hasAccess = await hasWorkflowAccess(user.id, data.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const result = await listExecutions(data.workflowId, {
      limit: data.limit ?? 50,
      offset: data.offset ?? 0,
      status: data.status as 'RECEIVED' | 'STARTED' | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'NO_DEPLOYMENT' | undefined,
    });

    return {
      results: result.executions.map((execution) => {
        const serialized = serializeExecution(execution);
        return {
          id: serialized.id as string,
          workflowId: serialized.workflowId as string,
          triggerId: (serialized.triggerId as string | null) ?? null,
          status: serialized.status as string,
          startedAt: (serialized.startedAt as string | null) ?? serialized.receivedAt as string,
          completedAt: (serialized.completedAt as string | null) ?? null,
          error: (serialized.errorMessage as string | null) ?? null,
          triggerPayload: {},
        };
      }),
      total: result.total,
    };
  });

/**
 * Get execution logs
 */
export const getExecutionLogs = createServerFn({ method: 'GET' })
  .inputValidator((input: { executionId: string }) => input)
  .handler(async ({ data }): Promise<{ results: ExecutionLog[] }> => {
    const user = await requireUser();
    const { getExecution: get, getExecutionLogs: getLogs } = await import('~/server/services/execution-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const execution = await get(data.executionId);
    if (!execution) {
      throw new Error('Execution not found');
    }

    const hasAccess = await hasWorkflowAccess(user.id, execution.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const logs = await getLogs(data.executionId);

    return {
      results: logs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        level: log.logLevel,
        message: log.message,
      })),
    };
  });
