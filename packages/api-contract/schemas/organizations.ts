import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
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
// Response schemas (from src/types/api.ts)
// ============================================================================

export const organizationSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const OrganizationRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;
export type OrganizationRole = typeof OrganizationRole[keyof typeof OrganizationRole];

export const organizationUserSchema = z.object({
  id: z.string(),
  workosUserId: z.string().nullable(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  createdAt: z.string(),
});

export const organizationMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  createdAt: z.string(),
  user: organizationUserSchema,
});

// Invitation schemas
export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  state: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

export const createInvitationSchema = z.object({
  email: z.string(),
  role: z.string().optional(),
  expiresInDays: z.number().optional(),
});

// SSO schemas
export const ssoSetupRequestSchema = z.object({
  returnUrl: z.string().optional(),
  successUrl: z.string().optional(),
});

export const ssoSetupResponseSchema = z.object({
  adminPortalLink: z.string(),
});

// ============================================================================
// Inferred types
// ============================================================================

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationCreate = CreateOrganizationInput;
export type OrganizationUpdate = UpdateOrganizationInput;
export type OrganizationUser = z.infer<typeof organizationUserSchema>;
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;
export type OrganizationMemberCreate = z.infer<typeof addMemberSchema>;
export type OrganizationMemberUpdate = z.infer<typeof updateMemberRoleSchema>;

export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationCreate = z.infer<typeof createInvitationSchema>;

export type SSOSetupRequest = z.infer<typeof ssoSetupRequestSchema>;
export type SSOSetupResponse = z.infer<typeof ssoSetupResponseSchema>;
