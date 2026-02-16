/**
 * API Request Body Schemas
 *
 * Zod schemas for validating request bodies.
 * All schemas use camelCase for consistency.
 */

import { z } from 'zod';

// ============================================================================
// Organization Schemas
// ============================================================================

export const createOrganizationSchema = z.object({
  displayName: z.string().min(1, 'displayName is required'),
});

export const updateOrganizationSchema = z.object({
  displayName: z.string().min(1).optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

// ============================================================================
// Workflow Schemas
// ============================================================================

export const createWorkflowSchema = z.object({
  namespaceId: z.string().min(1, 'namespaceId is required'),
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  parentFolderId: z.string().optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  parentFolderId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  triggersMetadata: z.unknown().optional(),
});

export const createDeploymentSchema = z.object({
  runtimeId: z.string().min(1, 'runtimeId is required'),
  userCode: z.object({
    files: z.record(z.string()),
    entrypoint: z.string(),
  }),
  providerDefinitions: z.unknown().optional(),
  triggerDefinitions: z.unknown().optional(),
  note: z.string().optional(),
});

// ============================================================================
// Folder Schemas
// ============================================================================

export const createFolderSchema = z.object({
  namespaceId: z.string().min(1, 'namespaceId is required'),
  name: z.string().min(1, 'name is required'),
  parentFolderId: z.string().optional(),
});

// ============================================================================
// Secret Schemas
// ============================================================================

export const createSecretSchema = z.object({
  namespaceId: z.string().min(1, 'namespaceId is required'),
  name: z.string().min(1, 'name is required'),
  value: z.string().min(1, 'value is required'),
  provider: z.string().optional(),
});

// ============================================================================
// Trigger Schemas
// ============================================================================

export const syncTriggersSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  namespaceId: z.string().min(1, 'namespaceId is required'),
  triggers: z.array(z.unknown()).optional(),
  providerMappings: z.record(z.record(z.string())).optional(),
});

export const executeTriggerSchema = z.object({
  data: z.unknown().optional(),
});

// ============================================================================
// Provider Schemas
// ============================================================================

export const createProviderSchema = z.object({
  namespaceId: z.string().min(1, 'namespaceId is required'),
  type: z.string().min(1, 'type is required'),
  alias: z.string().min(1, 'alias is required'),
  config: z.record(z.unknown()).optional().default({}),
});

export const updateProviderSchema = z.object({
  type: z.string().optional(),
  alias: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

// ============================================================================
// Subscription Schemas
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
// Runtime Schemas
// ============================================================================

export const createRuntimeSchema = z.object({
  config: z.record(z.unknown()),
});

// ============================================================================
// Execution Schemas
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
// Access Control Schemas
// ============================================================================

export const grantAccessSchema = z.object({
  principalType: z.enum(['user', 'organization', 'service_account']),
  principalId: z.string().min(1),
  resourceType: z.enum(['workflow', 'folder', 'provider', 'namespace']),
  resourceId: z.string().min(1),
  role: z.enum(['owner', 'editor', 'viewer']),
});

export const grantProviderAccessSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['owner', 'editor', 'viewer']),
});

export const updateAccessRoleSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
});

// ============================================================================
// Device Auth Schemas
// ============================================================================

export const deviceTokenSchema = z.object({
  deviceCode: z.string().min(1),
  grantType: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================================================
// Service Account Schemas
// ============================================================================

export const createServiceAccountSchema = z.object({
  organizationId: z.string().min(1, 'organizationId is required'),
  name: z.string().min(1, 'name is required'),
});

export const updateServiceAccountSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'name is required'),
});

// ============================================================================
// KV Store Schemas
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
// Centrifugo Schemas
// ============================================================================

export const centrifugoConnectSchema = z.object({
  client: z.string().optional(),
});

export const centrifugoSubscribeSchema = z.object({
  channel: z.string().min(1),
});

// ============================================================================
// Workflow Builder Schemas
// ============================================================================

export const workflowBuilderChatSchema = z.object({
  message: z.string().min(1),
  context: z.object({
    existingCode: z.string().optional(),
    providers: z.array(z.string()).optional(),
    triggers: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
  }).optional(),
  options: z.object({
    model: z.string().optional(),
    temperature: z.number().optional(),
    stream: z.boolean().optional(),
  }).optional(),
});

// ============================================================================
// N8N Import Schema
// ============================================================================

export const importN8nWorkflowSchema = z.object({
  namespaceId: z.string().min(1),
  n8nWorkflow: z.unknown(),
  name: z.string().optional(),
});

// ============================================================================
// Type exports
// ============================================================================

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type CreateSecretInput = z.infer<typeof createSecretSchema>;
export type SyncTriggersInput = z.infer<typeof syncTriggersSchema>;
export type ExecuteTriggerInput = z.infer<typeof executeTriggerSchema>;
export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type CreatePortalSessionInput = z.infer<typeof createPortalSessionSchema>;
export type CreateRuntimeInput = z.infer<typeof createRuntimeSchema>;
