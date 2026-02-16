import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
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
// Response schemas (from src/types/api.ts)
// ============================================================================

export const AccessRole = {
  OWNER: 'owner',
  USER: 'user',
} as const;
export type AccessRole = typeof AccessRole[keyof typeof AccessRole];

export const PrincipleType = {
  USER: 'user',
  WORKFLOW: 'workflow',
  FOLDER: 'folder',
} as const;
export type PrincipleType = typeof PrincipleType[keyof typeof PrincipleType];

export const ResourceType = {
  WORKFLOW: 'workflow',
  FOLDER: 'folder',
  PROVIDER: 'provider',
} as const;
export type ResourceType = typeof ResourceType[keyof typeof ResourceType];

export const providerAccessEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string().optional(),
  userFirstName: z.string().optional(),
  userLastName: z.string().optional(),
  role: z.enum(['owner', 'user']),
});

export const providerAccessListResponseSchema = z.object({
  results: z.array(providerAccessEntrySchema),
});

export const grantUserProviderAccessRequestSchema = z.object({
  userId: z.string(),
  role: z.enum(['owner', 'user']),
});

export const updateAccessRoleRequestSchema = z.object({
  role: z.enum(['owner', 'user']),
});

// ============================================================================
// Inferred types
// ============================================================================

export type GrantAccessInput = z.infer<typeof grantAccessSchema>;
export type GrantProviderAccessInput = z.infer<typeof grantProviderAccessSchema>;
export type UpdateAccessRoleInput = z.infer<typeof updateAccessRoleSchema>;

export type ProviderAccessEntry = z.infer<typeof providerAccessEntrySchema>;
export type ProviderAccessListResponse = z.infer<typeof providerAccessListResponseSchema>;
export type GrantUserProviderAccessRequest = z.infer<typeof grantUserProviderAccessRequestSchema>;
export type UpdateAccessRoleRequest = z.infer<typeof updateAccessRoleRequestSchema>;
