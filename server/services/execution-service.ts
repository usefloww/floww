/**
 * Execution Service
 *
 * Handles execution history tracking for workflow runs.
 * Creates execution records when triggers fire and updates status as execution progresses.
 */

import { eq, and, desc, ne, sql, ilike } from 'drizzle-orm';
import { getDb } from '~/server/db';
import {
  executionHistory,
  executionLogs,
  workflows,
  triggers,
  namespaces,
  organizationMembers,
  incomingWebhooks,
} from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';

export type ExecutionStatus =
  | 'RECEIVED'
  | 'STARTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'NO_DEPLOYMENT';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'LOG';

export interface ExecutionInfo {
  id: string;
  workflowId: string;
  triggerId: string | null;
  deploymentId: string | null;
  triggeredByUserId: string | null;
  status: ExecutionStatus;
  receivedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface ExecutionLogInfo {
  id: string;
  executionHistoryId: string;
  timestamp: Date;
  logLevel: LogLevel;
  message: string;
}

export interface ExecutionWithDetails extends ExecutionInfo {
  triggerType?: string | null;
  webhookPath?: string | null;
  webhookMethod?: string | null;
  logEntries?: ExecutionLogInfo[];
}

export interface StructuredLogEntry {
  timestamp?: string | Date;
  level?: string;
  message?: string;
}

/**
 * Create initial execution record when trigger fires
 */
export async function createExecution(params: {
  workflowId: string;
  triggerId?: string;
  triggeredByUserId?: string;
}): Promise<ExecutionInfo> {
  const db = getDb();

  const [execution] = await db
    .insert(executionHistory)
    .values({
      id: generateUlidUuid(),
      workflowId: params.workflowId,
      triggerId: params.triggerId ?? null,
      triggeredByUserId: params.triggeredByUserId ?? null,
      status: 'RECEIVED',
    })
    .returning();

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
  };
}

/**
 * Mark execution as started when runtime is invoked
 */
export async function updateExecutionStarted(
  executionId: string,
  deploymentId: string
): Promise<ExecutionInfo> {
  const db = getDb();

  const [execution] = await db
    .update(executionHistory)
    .set({
      status: 'STARTED',
      startedAt: new Date(),
      deploymentId,
    })
    .where(eq(executionHistory.id, executionId))
    .returning();

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
  };
}

/**
 * Mark execution as completed successfully
 */
export async function updateExecutionCompleted(
  executionId: string,
  options: {
    logs?: string | StructuredLogEntry[];
    durationMs?: number;
  } = {}
): Promise<ExecutionInfo> {
  const db = getDb();

  const [execution] = await db
    .update(executionHistory)
    .set({
      status: 'COMPLETED',
      completedAt: new Date(),
      durationMs: options.durationMs ?? null,
    })
    .where(eq(executionHistory.id, executionId))
    .returning();

  if (options.logs) {
    await processLogs(executionId, options.logs);
  }

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
  };
}

/**
 * Mark execution as failed with error details
 */
export async function updateExecutionFailed(
  executionId: string,
  errorMessage: string,
  options: {
    logs?: string | StructuredLogEntry[];
    durationMs?: number;
  } = {}
): Promise<ExecutionInfo> {
  const db = getDb();

  const [execution] = await db
    .update(executionHistory)
    .set({
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage,
      durationMs: options.durationMs ?? null,
    })
    .where(eq(executionHistory.id, executionId))
    .returning();

  if (options.logs) {
    await processLogs(executionId, options.logs);
  }

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
  };
}

/**
 * Mark execution when no deployment is found
 */
export async function updateExecutionNoDeployment(executionId: string): Promise<ExecutionInfo> {
  const db = getDb();

  const [execution] = await db
    .update(executionHistory)
    .set({
      status: 'NO_DEPLOYMENT',
      completedAt: new Date(),
    })
    .where(eq(executionHistory.id, executionId))
    .returning();

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
  };
}

/**
 * Mark execution as timed out
 */
export async function updateExecutionTimeout(executionId: string): Promise<ExecutionInfo> {
  const db = getDb();

  const [execution] = await db
    .update(executionHistory)
    .set({
      status: 'TIMEOUT',
      completedAt: new Date(),
    })
    .where(eq(executionHistory.id, executionId))
    .returning();

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
  };
}

/**
 * Get an execution by ID with optional relations
 */
export async function getExecution(executionId: string): Promise<ExecutionWithDetails | null> {
  const db = getDb();

  // Get execution with trigger info
  const result = await db
    .select({
      execution: executionHistory,
      triggerType: triggers.triggerType,
      webhookPath: incomingWebhooks.path,
      webhookMethod: incomingWebhooks.method,
    })
    .from(executionHistory)
    .leftJoin(triggers, eq(executionHistory.triggerId, triggers.id))
    .leftJoin(incomingWebhooks, eq(triggers.id, incomingWebhooks.triggerId))
    .where(eq(executionHistory.id, executionId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const { execution, triggerType, webhookPath, webhookMethod } = result[0];

  // Get log entries
  const logs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.executionHistoryId, executionId))
    .orderBy(executionLogs.timestamp);

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
    triggerType,
    webhookPath,
    webhookMethod,
    logEntries: logs.map((log) => ({
      id: log.id,
      executionHistoryId: log.executionHistoryId,
      timestamp: log.timestamp,
      logLevel: log.logLevel,
      message: log.message,
    })),
  };
}

/**
 * List executions for a workflow with pagination and filtering
 */
export async function listExecutions(
  workflowId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: ExecutionStatus;
    excludeNoDeployment?: boolean;
  } = {}
): Promise<{ executions: ExecutionWithDetails[]; total: number }> {
  const db = getDb();
  const { limit = 50, offset = 0, status, excludeNoDeployment = true } = options;

  const conditions = [eq(executionHistory.workflowId, workflowId)];

  if (excludeNoDeployment) {
    conditions.push(ne(executionHistory.status, 'NO_DEPLOYMENT'));
  }

  if (status) {
    conditions.push(eq(executionHistory.status, status));
  }

  // Get total count
  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(executionHistory)
    .where(and(...conditions));

  // Get executions with trigger info
  const result = await db
    .select({
      execution: executionHistory,
      triggerType: triggers.triggerType,
      webhookPath: incomingWebhooks.path,
      webhookMethod: incomingWebhooks.method,
    })
    .from(executionHistory)
    .leftJoin(triggers, eq(executionHistory.triggerId, triggers.id))
    .leftJoin(incomingWebhooks, eq(triggers.id, incomingWebhooks.triggerId))
    .where(and(...conditions))
    .orderBy(desc(executionHistory.receivedAt))
    .limit(limit)
    .offset(offset);

  return {
    executions: result.map(({ execution, triggerType, webhookPath, webhookMethod }) => ({
      id: execution.id,
      workflowId: execution.workflowId,
      triggerId: execution.triggerId,
      deploymentId: execution.deploymentId,
      triggeredByUserId: execution.triggeredByUserId,
      status: execution.status,
      receivedAt: execution.receivedAt,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      durationMs: execution.durationMs,
      errorMessage: execution.errorMessage,
      triggerType,
      webhookPath,
      webhookMethod,
    })),
    total,
  };
}

/**
 * List recent executions across all workflows accessible to a user
 */
export async function listRecentExecutions(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<ExecutionWithDetails[]> {
  const db = getDb();
  const { limit = 100, offset = 0 } = options;

  const result = await db
    .select({
      execution: executionHistory,
      triggerType: triggers.triggerType,
      webhookPath: incomingWebhooks.path,
      webhookMethod: incomingWebhooks.method,
    })
    .from(executionHistory)
    .innerJoin(workflows, eq(executionHistory.workflowId, workflows.id))
    .innerJoin(namespaces, eq(workflows.namespaceId, namespaces.id))
    .innerJoin(
      organizationMembers,
      eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
    )
    .leftJoin(triggers, eq(executionHistory.triggerId, triggers.id))
    .leftJoin(incomingWebhooks, eq(triggers.id, incomingWebhooks.triggerId))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(desc(executionHistory.receivedAt))
    .limit(limit)
    .offset(offset);

  return result.map(({ execution, triggerType, webhookPath, webhookMethod }) => ({
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
    triggerType,
    webhookPath,
    webhookMethod,
  }));
}

/**
 * Get execution logs for an execution
 */
export async function getExecutionLogs(executionId: string): Promise<ExecutionLogInfo[]> {
  const db = getDb();

  const logs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.executionHistoryId, executionId))
    .orderBy(executionLogs.timestamp);

  return logs.map((log) => ({
    id: log.id,
    executionHistoryId: log.executionHistoryId,
    timestamp: log.timestamp,
    logLevel: log.logLevel,
    message: log.message,
  }));
}

/**
 * Search logs across executions for a workflow
 */
export async function searchExecutionLogs(
  workflowId: string,
  options: {
    searchQuery?: string;
    level?: LogLevel;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ExecutionLogInfo[]> {
  const db = getDb();
  const { searchQuery, level, limit = 100, offset = 0 } = options;

  const conditions = [eq(executionHistory.workflowId, workflowId)];

  if (level) {
    conditions.push(eq(executionLogs.logLevel, level));
  }

  if (searchQuery) {
    conditions.push(ilike(executionLogs.message, `%${searchQuery}%`));
  }

  const result = await db
    .select({
      log: executionLogs,
    })
    .from(executionLogs)
    .innerJoin(executionHistory, eq(executionLogs.executionHistoryId, executionHistory.id))
    .where(and(...conditions))
    .orderBy(desc(executionLogs.timestamp))
    .limit(limit)
    .offset(offset);

  return result.map(({ log }) => ({
    id: log.id,
    executionHistoryId: log.executionHistoryId,
    timestamp: log.timestamp,
    logLevel: log.logLevel,
    message: log.message,
  }));
}

/**
 * Add a log entry to an execution
 */
export async function addExecutionLog(params: {
  executionId: string;
  timestamp?: Date;
  logLevel?: LogLevel;
  message: string;
}): Promise<ExecutionLogInfo> {
  const db = getDb();

  const [log] = await db
    .insert(executionLogs)
    .values({
      id: generateUlidUuid(),
      executionHistoryId: params.executionId,
      timestamp: params.timestamp ?? new Date(),
      logLevel: params.logLevel ?? 'LOG',
      message: params.message,
    })
    .returning();

  return {
    id: log.id,
    executionHistoryId: log.executionHistoryId,
    timestamp: log.timestamp,
    logLevel: log.logLevel,
    message: log.message,
  };
}

/**
 * Process logs and insert into execution_logs table
 * Handles both string and structured log formats
 */
async function processLogs(
  executionId: string,
  logs: string | StructuredLogEntry[]
): Promise<void> {
  const db = getDb();

  if (typeof logs === 'string') {
    // Legacy format: single string log
    await db.insert(executionLogs).values({
      id: generateUlidUuid(),
      executionHistoryId: executionId,
      timestamp: new Date(),
      logLevel: 'LOG',
      message: logs,
    });
  } else {
    // Structured format: list of log entries
    const logValues = logs.map((entry) => {
      // Parse timestamp
      let ts: Date;
      if (typeof entry.timestamp === 'string') {
        ts = new Date(entry.timestamp.replace('Z', '+00:00'));
      } else if (entry.timestamp instanceof Date) {
        ts = entry.timestamp;
      } else {
        ts = new Date();
      }

      // Parse log level
      const levelStr = (entry.level ?? 'LOG').toUpperCase();
      const logLevel: LogLevel = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'LOG'].includes(levelStr)
        ? (levelStr as LogLevel)
        : 'LOG';

      return {
        id: generateUlidUuid(),
        executionHistoryId: executionId,
        timestamp: ts,
        logLevel,
        message: entry.message ?? '',
      };
    });

    if (logValues.length > 0) {
      await db.insert(executionLogs).values(logValues);
    }
  }
}

/**
 * Serialize an execution for API response
 */
export function serializeExecution(execution: ExecutionWithDetails): Record<string, unknown> {
  // Use SDK-reported duration if available, otherwise calculate from timestamps
  let durationMs = execution.durationMs;
  if (durationMs === null && execution.startedAt && execution.completedAt) {
    durationMs = execution.completedAt.getTime() - execution.startedAt.getTime();
  }

  return {
    id: execution.id,
    workflowId: execution.workflowId,
    triggerId: execution.triggerId,
    deploymentId: execution.deploymentId,
    triggeredByUserId: execution.triggeredByUserId,
    status: execution.status,
    receivedAt: execution.receivedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    completedAt: execution.completedAt?.toISOString() ?? null,
    durationMs: durationMs,
    errorMessage: execution.errorMessage,
    triggerType: execution.triggerType ?? null,
    webhookPath: execution.webhookPath ?? null,
    webhookMethod: execution.webhookMethod ?? null,
    logEntries: execution.logEntries?.map((log) => ({
      id: log.id,
      executionId: log.executionHistoryId,
      timestamp: log.timestamp.toISOString(),
      level: log.logLevel,
      message: log.message,
    })),
  };
}
