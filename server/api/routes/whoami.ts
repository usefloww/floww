/**
 * Whoami Route
 *
 * GET /api/whoami - Get current user info
 */

import { get, json, errorResponse } from '~/server/api/router';
import { getUserOrganizations } from '~/server/services/organization-service';

get('/whoami', async (ctx) => {
  const { user } = ctx;

  if (!user) {
    return errorResponse('Not authenticated', 401);
  }

  // Get user's organizations
  const organizations = await getUserOrganizations(user.id);

  return json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
    },
    organizations: organizations.map((org) => ({
      id: org.id,
      displayName: org.displayName,
    })),
  });
});
