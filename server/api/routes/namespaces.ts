/**
 * Namespaces API Routes
 *
 * GET /api/namespaces - List namespaces accessible to user
 * GET /api/namespaces/:namespaceId - Get namespace details
 */

import { eq, and } from 'drizzle-orm';
import { get, json, errorResponse } from '~/server/api/router';
import { getDb } from '~/server/db';
import { namespaces, organizations, organizationMembers } from '~/server/db/schema';

// List namespaces accessible to user
get('/namespaces', async ({ user }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const db = getDb();

  // Get namespaces where user is a member of the owning organization
  const results = await db
    .select({
      id: namespaces.id,
      organizationId: namespaces.organizationOwnerId,
      organizationDisplayName: organizations.displayName,
    })
    .from(namespaces)
    .innerJoin(organizations, eq(namespaces.organizationOwnerId, organizations.id))
    .innerJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, organizations.id),
        eq(organizationMembers.userId, user.id)
      )
    );

  return json({
    results: results.map((ns) => ({
      id: ns.id,
      organization: {
        id: ns.organizationId,
        displayName: ns.organizationDisplayName,
      },
    })),
    total: results.length,
  });
});

// Get namespace details
get('/namespaces/:namespaceId', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  try {
    const db = getDb();

    // Get namespace with organization details
    const result = await db
      .select({
        id: namespaces.id,
        organizationId: namespaces.organizationOwnerId,
        organizationDisplayName: organizations.displayName,
        createdAt: namespaces.createdAt,
      })
      .from(namespaces)
      .innerJoin(organizations, eq(namespaces.organizationOwnerId, organizations.id))
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, organizations.id),
          eq(organizationMembers.userId, user.id)
        )
      )
      .where(eq(namespaces.id, params.namespaceId))
      .limit(1);

    if (result.length === 0) {
      return errorResponse('Namespace not found', 404);
    }

    const ns = result[0];

    return json({
      id: ns.id,
      organization: {
        id: ns.organizationId,
        displayName: ns.organizationDisplayName,
      },
      createdAt: ns.createdAt?.toISOString(),
    });
  } catch (error) {
    // Database errors (e.g., invalid UUID format) should return 404
    return errorResponse('Namespace not found', 404);
  }
});
