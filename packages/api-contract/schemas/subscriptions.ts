import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const subscribeSchema = z.object({
  organizationId: z.string().min(1, 'organizationId is required'),
  tier: z.enum(['hobby', 'team']),
});

export const createPortalSessionSchema = z.object({
  organizationId: z.string().min(1, 'organizationId is required'),
  returnUrl: z.string().url('returnUrl must be a valid URL'),
});

// ============================================================================
// Inferred types
// ============================================================================

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type CreatePortalSessionInput = z.infer<typeof createPortalSessionSchema>;
