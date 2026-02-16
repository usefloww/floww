import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const createRuntimeSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

// ============================================================================
// Inferred types
// ============================================================================

export type CreateRuntimeInput = z.infer<typeof createRuntimeSchema>;
