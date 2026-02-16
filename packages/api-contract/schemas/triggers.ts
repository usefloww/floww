import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const syncTriggersSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  namespaceId: z.string().min(1, 'namespaceId is required'),
  triggers: z.array(z.unknown()).optional(),
  providerMappings: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

export const executeTriggerSchema = z.object({
  data: z.unknown().optional(),
});

// ============================================================================
// Inferred types
// ============================================================================

export type SyncTriggersInput = z.infer<typeof syncTriggersSchema>;
export type ExecuteTriggerInput = z.infer<typeof executeTriggerSchema>;
