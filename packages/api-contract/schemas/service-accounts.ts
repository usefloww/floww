import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
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
// Response schemas (from src/types/api.ts)
// ============================================================================

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
});

export const apiKeyCreatedResponseSchema = apiKeySchema.extend({
  apiKey: z.string(),
});

export const serviceAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  organizationId: z.string(),
  apiKeys: z.array(apiKeySchema),
});

export const serviceAccountsListResponseSchema = z.object({
  results: z.array(serviceAccountSchema),
});

// ============================================================================
// Inferred types
// ============================================================================

export type CreateServiceAccountInput = z.infer<typeof createServiceAccountSchema>;
export type UpdateServiceAccountInput = z.infer<typeof updateServiceAccountSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export type ApiKey = z.infer<typeof apiKeySchema>;
export type ApiKeyCreatedResponse = z.infer<typeof apiKeyCreatedResponseSchema>;
export type ServiceAccount = z.infer<typeof serviceAccountSchema>;
export type ServiceAccountCreate = CreateServiceAccountInput;
export type ServiceAccountUpdate = UpdateServiceAccountInput;
export type ApiKeyCreate = CreateApiKeyInput;
export type ServiceAccountsListResponse = z.infer<typeof serviceAccountsListResponseSchema>;
