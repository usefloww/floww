/**
 * Authentication Utilities
 *
 * Helper functions for checking authentication in API routes and server functions.
 */

import { auth } from '~/server/auth';
import {
  getOrganizationMembership,
  getUserOrganizations as getOrgServiceUserOrganizations,
  type OrganizationRole,
} from '~/server/services/organization-service';

/**
 * Require authentication for API routes.
 * Throws a 401 response if the user is not authenticated.
 *
 * @param request - The incoming request
 * @returns The authenticated user
 * @throws Response with 401 status if not authenticated
 */
export async function requireAuth(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw new Response('Unauthorized', { status: 401 });
  }

  return session.user;
}

/**
 * Get optional authentication.
 * Returns the user if authenticated, null otherwise.
 * Does not throw on unauthenticated requests.
 *
 * @param request - The incoming request
 * @returns The authenticated user or null
 */
export async function getOptionalAuth(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return session?.user ?? null;
  } catch {
    return null;
  }
}

// Role priority for comparison (higher = more permissive)
const ROLE_PRIORITY: Record<OrganizationRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Check if a user has at least the required role in an organization.
 * Role hierarchy: owner > admin > member
 */
export async function checkOrganizationRole(
  userId: string,
  organizationId: string,
  requiredRole: 'OWNER' | 'ADMIN' | 'MEMBER'
): Promise<boolean> {
  const membership = await getOrganizationMembership(organizationId, userId);
  if (!membership) {
    return false;
  }

  // Check if the user's role meets the minimum required
  return ROLE_PRIORITY[membership.role] >= ROLE_PRIORITY[requiredRole];
}

/**
 * Get all organizations a user belongs to.
 */
export async function getUserOrganizations(userId: string) {
  return getOrgServiceUserOrganizations(userId);
}
