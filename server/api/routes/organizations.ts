/**
 * Organization Routes
 *
 * GET /api/organizations - List user's organizations
 * POST /api/organizations - Create organization
 * GET /api/organizations/:id - Get organization
 * PATCH /api/organizations/:id - Update organization
 * DELETE /api/organizations/:id - Delete organization
 * GET /api/organizations/:id/members - List members
 * POST /api/organizations/:id/members - Add member
 * PATCH /api/organizations/:id/members/:userId - Update member role
 * DELETE /api/organizations/:id/members/:userId - Remove member
 */

import { get, post, patch, del, json, errorResponse, parseBody } from '~/server/api/router';
import * as orgService from '~/server/services/organization-service';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  addMemberSchema,
  updateMemberRoleSchema,
} from '~/server/api/schemas';

// List user's organizations
get('/organizations', async (ctx) => {
  const { user } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const organizations = await orgService.getUserOrganizations(user.id);

  return json({
    results: organizations.map((org) => ({
      id: org.id,
      displayName: org.displayName,
      workosOrganizationId: org.workosOrganizationId,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    })),
  });
});

// Create organization
post('/organizations', async (ctx) => {
  const { user, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, createOrganizationSchema);
  if ('error' in parsed) return parsed.error;

  const { organization, namespace } = await orgService.createOrganization({
    displayName: parsed.data.displayName,
    ownerId: user.id,
  });

  return json({
    organization: {
      id: organization.id,
      displayName: organization.displayName,
      createdAt: organization.createdAt.toISOString(),
    },
    namespace: {
      id: namespace.id,
    },
  }, 201);
});

// Get organization
get('/organizations/:organizationId', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const org = await orgService.getOrganization(params.organizationId);
  if (!org) {
    return errorResponse('Organization not found', 404);
  }

  // Check access
  const isMember = await orgService.isMember(org.id, user.id);
  if (!isMember && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  return json({
    id: org.id,
    displayName: org.displayName,
    workosOrganizationId: org.workosOrganizationId,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  });
});

// Update organization
patch('/organizations/:organizationId', async (ctx) => {
  const { user, params, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  // Check admin access
  const isAdmin = await orgService.isAdmin(params.organizationId, user.id);
  if (!isAdmin && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const parsed = await parseBody(request, updateOrganizationSchema);
  if ('error' in parsed) return parsed.error;

  const org = await orgService.updateOrganization(params.organizationId, {
    displayName: parsed.data.displayName,
  });

  if (!org) {
    return errorResponse('Organization not found', 404);
  }

  return json({
    id: org.id,
    displayName: org.displayName,
    updatedAt: org.updatedAt.toISOString(),
  });
});

// Delete organization
del('/organizations/:organizationId', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  // Check owner access
  const isOwner = await orgService.isOwner(params.organizationId, user.id);
  if (!isOwner && !user.isAdmin) {
    return errorResponse('Only owners can delete organizations', 403);
  }

  await orgService.deleteOrganization(params.organizationId);

  return json({ success: true });
});

// List organization members
get('/organizations/:organizationId/members', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const isMember = await orgService.isMember(params.organizationId, user.id);
  if (!isMember && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const members = await orgService.getOrganizationMembers(params.organizationId);

  return json({
    results: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    })),
  });
});

// Add organization member
post('/organizations/:organizationId/members', async (ctx) => {
  const { user, params, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const isAdmin = await orgService.isAdmin(params.organizationId, user.id);
  if (!isAdmin && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const parsed = await parseBody(request, addMemberSchema);
  if ('error' in parsed) return parsed.error;

  const membership = await orgService.addMember(
    params.organizationId,
    parsed.data.userId,
    parsed.data.role
  );

  return json({
    id: membership.id,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
  }, 201);
});

// Update member role
patch('/organizations/:organizationId/members/:userId', async (ctx) => {
  const { user, params, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const isAdmin = await orgService.isAdmin(params.organizationId, user.id);
  if (!isAdmin && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const parsed = await parseBody(request, updateMemberRoleSchema);
  if ('error' in parsed) return parsed.error;

  const membership = await orgService.updateMemberRole(
    params.organizationId,
    params.userId,
    parsed.data.role
  );

  if (!membership) {
    return errorResponse('Member not found', 404);
  }

  return json({
    id: membership.id,
    userId: membership.userId,
    role: membership.role,
  });
});

// Remove member
del('/organizations/:organizationId/members/:userId', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const isAdmin = await orgService.isAdmin(params.organizationId, user.id);
  if (!isAdmin && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  try {
    await orgService.removeMember(params.organizationId, params.userId);
    return json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('last owner')) {
      return errorResponse(error.message, 400);
    }
    throw error;
  }
});
