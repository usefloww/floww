import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export interface OrganizationInfo {
  id: string;
  displayName: string;
  workosOrganizationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationInfo {
  id: string;
  email: string;
  state: string;
  createdAt: string;
  expiresAt: string;
}

export interface OrganizationMemberInfo {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

/**
 * List organizations for the current user
 */
export const getOrganizations = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ results: OrganizationInfo[] }> => {
    const user = await requireUser();
    const { getUserOrganizations } = await import('~/server/services/organization-service');

    const organizations = await getUserOrganizations(user.id);

    return {
      results: organizations.map((org) => ({
        id: org.id,
        displayName: org.displayName,
        workosOrganizationId: org.workosOrganizationId,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
      })),
    };
  }
);

/**
 * Get a single organization by ID
 */
export const getOrganization = createServerFn({ method: 'GET' })
  .inputValidator((input: { organizationId: string } | undefined) => {
    if (!input || !input.organizationId) {
      throw new Error('organizationId is required');
    }
    return input;
  })
  .handler(async ({ data }): Promise<OrganizationInfo> => {
    if (!data || !data.organizationId) {
      throw new Error('organizationId is required');
    }
    
    const user = await requireUser();
    const { getOrganization: get, isMember } = await import('~/server/services/organization-service');

    const org = await get(data.organizationId);
    if (!org) {
      throw new Error('Organization not found');
    }

    const hasAccess = await isMember(org.id, user.id);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return {
      id: org.id,
      displayName: org.displayName,
      workosOrganizationId: org.workosOrganizationId,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  });

/**
 * Update an organization
 */
export const updateOrganization = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; displayName?: string } | undefined) => {
    if (!input || !input.organizationId) {
      throw new Error('organizationId is required');
    }
    return input;
  })
  .handler(async ({ data }): Promise<OrganizationInfo> => {
    if (!data || !data.organizationId) {
      throw new Error('organizationId is required');
    }
    
    const user = await requireUser();
    const { updateOrganization: update, isAdmin } = await import('~/server/services/organization-service');

    const hasAdminAccess = await isAdmin(data.organizationId, user.id);
    if (!hasAdminAccess) {
      throw new Error('Admin access required');
    }

    const org = await update(data.organizationId, {
      displayName: data.displayName,
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    return {
      id: org.id,
      displayName: org.displayName,
      workosOrganizationId: org.workosOrganizationId,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  });

/**
 * Delete an organization
 */
export const deleteOrganization = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string } | undefined) => {
    if (!input || !input.organizationId) {
      throw new Error('organizationId is required');
    }
    return input;
  })
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    if (!data || !data.organizationId) {
      throw new Error('organizationId is required');
    }
    
    const user = await requireUser();
    const { deleteOrganization: del, isOwner } = await import('~/server/services/organization-service');

    const hasOwnerAccess = await isOwner(data.organizationId, user.id);
    if (!hasOwnerAccess) {
      throw new Error('Only owners can delete organizations');
    }

    await del(data.organizationId);
    return { success: true };
  });

/**
 * Get organization members
 */
export const getOrganizationMembers = createServerFn({ method: 'GET' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<{ results: OrganizationMemberInfo[] }> => {
    const user = await requireUser();
    const { getOrganizationMembers: getMembers, isMember } = await import('~/server/services/organization-service');

    const hasAccess = await isMember(data.organizationId, user.id);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const members = await getMembers(data.organizationId);

    return {
      results: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
        user: m.user ? {
          id: m.user.id,
          email: m.user.email ?? '',
          firstName: m.user.firstName,
          lastName: m.user.lastName,
        } : null,
      })),
    };
  });

/**
 * Setup SSO for an organization
 */
export const setupSSO = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    organizationId: string;
    returnUrl: string;
    successUrl: string;
    features?: string[];
  }) => input)
  .handler(async ({ data }): Promise<{ url: string }> => {
    const user = await requireUser();
    const { isAdmin } = await import('~/server/services/organization-service');

    const hasAdminAccess = await isAdmin(data.organizationId, user.id);
    if (!hasAdminAccess) {
      throw new Error('Admin access required');
    }

    // Lazy import WorkOS client
    const { getWorkOS } = await import('~/server/auth/workos');
    const workos = getWorkOS();
    
    // Create admin portal link for SSO setup
    const portalLink = await workos.portal.generateLink({
      organization: data.organizationId,
      intent: 'sso' as any,
      returnUrl: data.successUrl,
    });

    return { url: portalLink.link };
  });

/**
 * Create an organization
 */
export const createOrganization = createServerFn({ method: 'POST' })
  .inputValidator((input: { displayName: string }) => input)
  .handler(async ({ data }): Promise<{ organization: OrganizationInfo; namespaceId: string }> => {
    const user = await requireUser();
    const { createOrganization: create } = await import('~/server/services/organization-service');

    const { organization, namespace } = await create({
      displayName: data.displayName,
      ownerId: user.id,
    });

    return {
      organization: {
        id: organization.id,
        displayName: organization.displayName,
        workosOrganizationId: organization.workosOrganizationId,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      },
      namespaceId: namespace.id,
    };
  });

/**
 * Add a member to an organization
 */
export const addOrganizationMember = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; userId: string; role: string }) => input)
  .handler(async ({ data }): Promise<OrganizationMemberInfo> => {
    const user = await requireUser();
    const { addMember, isAdmin } = await import('~/server/services/organization-service');

    const hasAdminAccess = await isAdmin(data.organizationId, user.id);
    if (!hasAdminAccess) {
      throw new Error('Admin access required');
    }

    const membership = await addMember(data.organizationId, data.userId, data.role as 'OWNER' | 'ADMIN' | 'MEMBER');

    return {
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
      user: null,
    };
  });

/**
 * Update a member's role
 */
export const updateOrganizationMemberRole = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; userId: string; role: string }) => input)
  .handler(async ({ data }): Promise<OrganizationMemberInfo> => {
    const user = await requireUser();
    const { updateMemberRole, isAdmin } = await import('~/server/services/organization-service');

    const hasAdminAccess = await isAdmin(data.organizationId, user.id);
    if (!hasAdminAccess) {
      throw new Error('Admin access required');
    }

    const membership = await updateMemberRole(data.organizationId, data.userId, data.role as 'OWNER' | 'ADMIN' | 'MEMBER');
    if (!membership) {
      throw new Error('Member not found');
    }

    return {
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
      user: null,
    };
  });

/**
 * Remove a member from an organization
 */
export const removeOrganizationMember = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; userId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { removeMember, isAdmin } = await import('~/server/services/organization-service');

    const hasAdminAccess = await isAdmin(data.organizationId, user.id);
    if (!hasAdminAccess) {
      throw new Error('Admin access required');
    }

    await removeMember(data.organizationId, data.userId);
    return { success: true };
  });

// ============================================================================
// Invitation Functions
// ============================================================================

/**
 * Get pending invitations for an organization
 */
export const getOrganizationInvitations = createServerFn({ method: 'GET' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<InvitationInfo[]> => {
    const user = await requireUser();
    const { getOrganization: get, isAdmin } = await import('~/server/services/organization-service');

    const org = await get(data.organizationId);
    if (!org) {
      throw new Error('Organization not found');
    }

    // Only admins/owners can view invitations
    const hasAdminAccess = await isAdmin(data.organizationId, user.id);
    if (!hasAdminAccess) {
      throw new Error('Admin access required');
    }

    // If no WorkOS organization ID, return empty list
    if (!org.workosOrganizationId) {
      return [];
    }

    try {
      const { getWorkOS } = await import('~/server/auth/workos');
      const workos = getWorkOS();

      const invitationsResponse = await workos.userManagement.listInvitations({
        organizationId: org.workosOrganizationId,
      });

      return invitationsResponse.data.map((inv) => ({
        id: inv.id,
        email: inv.email,
        state: inv.state,
        createdAt: String(inv.createdAt),
        expiresAt: String(inv.expiresAt),
      }));
    } catch (error) {
      // If WorkOS is not configured, return empty list
      if (error instanceof Error && error.message.includes('WORKOS_API_KEY')) {
        return [];
      }
      throw error;
    }
  });

/**
 * Send an invitation to join an organization
 */
export const sendOrganizationInvitation = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; email: string; role?: string; expiresInDays?: number }) => input)
  .handler(async ({ data }): Promise<InvitationInfo> => {
    const user = await requireUser();
    const { getOrganization: get, isAdmin } = await import('~/server/services/organization-service');

    const org = await get(data.organizationId);
    if (!org) {
      throw new Error('Organization not found');
    }

    // Only admins/owners can send invitations
    const hasAdminAccess = await isAdmin(data.organizationId, user.id);
    if (!hasAdminAccess) {
      throw new Error('Admin access required');
    }

    if (!org.workosOrganizationId) {
      throw new Error('Organization does not have a WorkOS organization ID configured');
    }

    const { getWorkOS } = await import('~/server/auth/workos');
    const workos = getWorkOS();

    // Get the current user's WorkOS ID to use as inviter
    const { users } = await import('~/server/db/schema');
    const { getDb } = await import('~/server/db');
    const { eq } = await import('drizzle-orm');

    const db = getDb();
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const inviterWorkosId = dbUser?.workosUserId ?? undefined;

    const invitation = await workos.userManagement.sendInvitation({
      email: data.email,
      organizationId: org.workosOrganizationId,
      inviterUserId: inviterWorkosId,
      roleSlug: data.role,
      expiresInDays: data.expiresInDays ?? 7,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      state: invitation.state,
      createdAt: String(invitation.createdAt),
      expiresAt: String(invitation.expiresAt),
    };
  });

/**
 * Revoke a pending invitation
 */
export const revokeOrganizationInvitation = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; invitationId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { isAdmin } = await import('~/server/services/organization-service');

    // Only admins/owners can revoke invitations
    const hasAdminAccess = await isAdmin(data.organizationId, user.id);
    if (!hasAdminAccess) {
      throw new Error('Admin access required');
    }

    const { getWorkOS } = await import('~/server/auth/workos');
    const workos = getWorkOS();

    await workos.userManagement.revokeInvitation(data.invitationId);

    return { success: true };
  });
