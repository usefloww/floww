import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const createSecretSchema = z.object({
  namespaceId: z.string().min(1, 'namespaceId is required'),
  name: z.string().min(1, 'name is required'),
  value: z.string().min(1, 'value is required'),
  provider: z.string().optional(),
});

// ============================================================================
// Inferred types
// ============================================================================

export type CreateSecretInput = z.infer<typeof createSecretSchema>;
