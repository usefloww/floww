import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const createDeploymentSchema = z.object({
  runtimeId: z.string().min(1, 'runtimeId is required'),
  userCode: z.object({
    files: z.record(z.string(), z.string()),
    entrypoint: z.string(),
  }),
  providerDefinitions: z.unknown().optional(),
  triggerDefinitions: z.unknown().optional(),
  note: z.string().optional(),
});

// ============================================================================
// Response schemas (from src/types/api.ts)
// ============================================================================

export const WorkflowDeploymentStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  FAILED: 'failed',
} as const;
export type WorkflowDeploymentStatus = typeof WorkflowDeploymentStatus[keyof typeof WorkflowDeploymentStatus];

export const workflowDeploymentStatusSchema = z.enum(['active', 'inactive', 'failed']);

export const workflowDeploymentSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  runtimeId: z.string(),
  deployedById: z.string().nullable().optional(),
  userCode: z.object({
    files: z.record(z.string(), z.string()),
    entrypoint: z.string(),
  }),
  status: workflowDeploymentStatusSchema,
  deployedAt: z.string(),
  note: z.string().nullable().optional(),
  webhooks: z.array(z.object({
    id: z.string(),
    url: z.string(),
    path: z.string().nullable().optional(),
    method: z.string().nullable().optional(),
  })).nullable().optional(),
});

export const workflowDeploymentsResponseSchema = z.object({
  results: z.array(workflowDeploymentSchema),
});

// ============================================================================
// Inferred types
// ============================================================================

export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;
export type WorkflowDeployment = z.infer<typeof workflowDeploymentSchema>;
export type WorkflowDeploymentsResponse = z.infer<typeof workflowDeploymentsResponseSchema>;
