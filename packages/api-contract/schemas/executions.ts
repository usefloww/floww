import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const completeExecutionSchema = z.object({
  status: z.enum(['completed', 'failed']),
  logs: z.array(z.object({
    timestamp: z.string(),
    level: z.string(),
    message: z.string(),
  })).optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

// ============================================================================
// Response schemas (from src/types/api.ts)
// ============================================================================

export const executionStatusValues = [
  'received',
  'started',
  'completed',
  'failed',
  'timeout',
  'no_deployment',
] as const;

export const executionStatusSchema = z.enum(executionStatusValues);

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error', 'log']);

export const executionLogEntrySchema = z.object({
  id: z.string(),
  executionId: z.string(),
  timestamp: z.string(),
  level: logLevelSchema,
  message: z.string(),
});

export const executionHistorySchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  triggerId: z.string().nullable(),
  deploymentId: z.string().nullable(),
  status: executionStatusSchema,
  receivedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  logEntries: z.array(executionLogEntrySchema).nullable(),
  triggerType: z.string().nullable(),
  webhookPath: z.string().nullable(),
  webhookMethod: z.string().nullable(),
});

export const executionHistoryResponseSchema = z.object({
  executions: z.array(executionHistorySchema),
  total: z.number(),
});

export const workflowLogsResponseSchema = z.object({
  workflowId: z.string(),
  logs: z.array(executionLogEntrySchema),
  limit: z.number(),
  offset: z.number(),
});

export const executionDaySummarySchema = z.object({
  date: z.string(),
  total: z.number(),
  completed: z.number(),
  failed: z.number(),
  started: z.number(),
  received: z.number(),
  timeout: z.number(),
  noDeployment: z.number(),
});

export const summaryResponseSchema = z.object({
  executionsByDay: z.array(executionDaySummarySchema),
  totalExecutions: z.number(),
  totalCompleted: z.number(),
  totalFailed: z.number(),
  periodDays: z.number(),
});

// ============================================================================
// Inferred types
// ============================================================================

export type CompleteExecutionInput = z.infer<typeof completeExecutionSchema>;

export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
export type ExecutionLogEntry = z.infer<typeof executionLogEntrySchema>;
export type ExecutionHistory = z.infer<typeof executionHistorySchema>;
export type ExecutionHistoryResponse = z.infer<typeof executionHistoryResponseSchema>;
export type WorkflowLogsResponse = z.infer<typeof workflowLogsResponseSchema>;
export type ExecutionDaySummary = z.infer<typeof executionDaySummarySchema>;
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;
