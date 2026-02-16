import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const setKvValueSchema = z.object({
  value: z.unknown(),
});

export const setKvPermissionsSchema = z.object({
  workflowId: z.string().min(1),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
});

// ============================================================================
// Inferred types
// ============================================================================

export type SetKvValueInput = z.infer<typeof setKvValueSchema>;
export type SetKvPermissionsInput = z.infer<typeof setKvPermissionsSchema>;
