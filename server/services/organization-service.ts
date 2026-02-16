/**
 * Organization Service
 *
 * Handles organization CRUD operations and membership management
 */

import { eq, and, count as countFn } from 'drizzle-orm';
import { getDb } from '~/server/db';
import {
  organizations,
  organizationMembers,
  namespaces,
  users,
  subscriptions,
  type Namespace,
} from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface OrganizationInfo {
  id: string;
  workosOrganizationId: string | null;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMemberInfo {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: Date;
  user?: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

function generateOrgName(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
  username: string | null,
  userId: string
): { name: string; displayName: string } {
  // Generate display name
  let displayName: string;
  if (firstName && lastName) {
    displayName = `${firstName} ${lastName}`;
  } else if (firstName) {
    displayName = firstName;
  } else if (lastName) {
    displayName = lastName;
  } else if (username) {
    displayName = username;
  } else if (email) {
    displayName = email.split('@')[0];
  } else {
    displayName = `User ${userId.slice(0, 8)}`;
  }

  // Create slug from display name
  let name = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!name) {
    name = `user-${userId.slice(0, 8)}`;
  }

  return { name, displayName };
}

/**
 * Get an organization by ID
 */
export async function getOrganization(organizationId: string): Promise<OrganizationInfo | null> {
  const db = getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    return null;
  }

  return {
    id: org.id,
    workosOrganizationId: org.workosOrganizationId,
    displayName: org.displayName,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}

/**
 * Get organizations a user is a member of
 */
export async function getUserOrganizations(userId: string): Promise<OrganizationInfo[]> {
  const db = getDb();

  const result = await db
    .select({
      id: organizations.id,
      workosOrganizationId: organizations.workosOrganizationId,
      displayName: organizations.displayName,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizations)
    .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId));

  return result;
}

/**
 * Create a new organization with a namespace
 */
export async function createOrganization(params: {
  displayName: string;
  workosOrganizationId?: string;
  ownerId: string;
}): Promise<{ organization: OrganizationInfo; namespace: Namespace }> {
  const db = getDb();

  const orgId = generateUlidUuid();
  const namespaceId = generateUlidUuid();

  // Create organization
  const [org] = await db
    .insert(organizations)
    .values({
      id: orgId,
      displayName: params.displayName,
      workosOrganizationId: params.workosOrganizationId ?? null,
    })
    .returning();

  // Create organization membership (owner)
  await db.insert(organizationMembers).values({
    organizationId: orgId,
    userId: params.ownerId,
    role: 'OWNER',
  });

  // Create namespace for the organization
  const [namespace] = await db
    .insert(namespaces)
    .values({
      id: namespaceId,
      organizationOwnerId: orgId,
    })
    .returning();

  // Create free subscription for the organization
  await db.insert(subscriptions).values({
    organizationId: orgId,
    tier: 'FREE',
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
  });

  return {
    organization: {
      id: org.id,
      workosOrganizationId: org.workosOrganizationId,
      displayName: org.displayName,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    },
    namespace,
  };
}

/**
 * Create organization and namespace for a new user
 */
export async function createUserOrganization(params: {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  username?: string | null;
}): Promise<{ organization: OrganizationInfo; namespace: Namespace }> {
  const { displayName } = generateOrgName(
    params.firstName ?? null,
    params.lastName ?? null,
    params.email ?? null,
    params.username ?? null,
    params.userId
  );

  return createOrganization({
    displayName,
    ownerId: params.userId,
  });
}

/**
 * Update an organization
 */
export async function updateOrganization(
  organizationId: string,
  updates: {
    displayName?: string;
    workosOrganizationId?: string | null;
  }
): Promise<OrganizationInfo | null> {
  const db = getDb();

  const [org] = await db
    .update(organizations)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId))
    .returning();

  if (!org) {
    return null;
  }

  return {
    id: org.id,
    workosOrganizationId: org.workosOrganizationId,
    displayName: org.displayName,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}

/**
 * Delete an organization (cascades to namespace, workflows, etc.)
 */
export async function deleteOrganization(organizationId: string): Promise<boolean> {
  const db = getDb();

  await db.delete(organizations).where(eq(organizations.id, organizationId));

  return true;
}

/**
 * Get members of an organization
 */
export async function getOrganizationMembers(
  organizationId: string
): Promise<OrganizationMemberInfo[]> {
  const db = getDb();

  const result = await db
    .select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      createdAt: organizationMembers.createdAt,
      userEmail: users.email,
      userFirstName: users.firstName,
      userLastName: users.lastName,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId));

  return result.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt,
    user: {
      id: row.userId,
      email: row.userEmail,
      firstName: row.userFirstName,
      lastName: row.userLastName,
    },
  }));
}

/**
 * Get a user's membership in an organization
 */
export async function getOrganizationMembership(
  organizationId: string,
  userId: string
): Promise<OrganizationMemberInfo | null> {
  const db = getDb();

  const [membership] = await db
    .select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      createdAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  return membership;
}

/**
 * Add a member to an organization
 */
export async function addMember(
  organizationId: string,
  userId: string,
  role: OrganizationRole = 'MEMBER'
): Promise<OrganizationMemberInfo> {
  const db = getDb();

  const [membership] = await db
    .insert(organizationMembers)
    .values({
      organizationId,
      userId,
      role,
    })
    .returning();

  return {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt,
  };
}

/**
 * Update a member's role in an organization
 */
export async function updateMemberRole(
  organizationId: string,
  userId: string,
  role: OrganizationRole
): Promise<OrganizationMemberInfo | null> {
  const db = getDb();

  const [membership] = await db
    .update(organizationMembers)
    .set({ role })
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    )
    .returning();

  if (!membership) {
    return null;
  }

  return {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt,
  };
}

/**
 * Remove a member from an organization
 */
export async function removeMember(organizationId: string, userId: string): Promise<boolean> {
  const db = getDb();

  // Check if this is the last owner
  const owners = await db
    .select({ count: countFn() })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, 'OWNER')));

  const membership = await getOrganizationMembership(organizationId, userId);
  if (membership?.role === 'OWNER' && owners[0].count <= 1) {
    throw new Error('Cannot remove the last owner of an organization');
  }

  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    );

  return true;
}

/**
 * Check if a user is a member of an organization
 */
export async function isMember(organizationId: string, userId: string): Promise<boolean> {
  const membership = await getOrganizationMembership(organizationId, userId);
  return membership !== null;
}

/**
 * Check if a user has admin-level access to an organization (owner or admin)
 */
export async function isAdmin(organizationId: string, userId: string): Promise<boolean> {
  const membership = await getOrganizationMembership(organizationId, userId);
  return membership !== null && (membership.role === 'OWNER' || membership.role === 'ADMIN');
}

/**
 * Check if a user is an owner of an organization
 */
export async function isOwner(organizationId: string, userId: string): Promise<boolean> {
  const membership = await getOrganizationMembership(organizationId, userId);
  return membership !== null && membership.role === 'OWNER';
}

/**
 * Get the namespace for an organization
 */
export async function getOrganizationNamespace(organizationId: string): Promise<Namespace | null> {
  const db = getDb();

  const [namespace] = await db
    .select()
    .from(namespaces)
    .where(eq(namespaces.organizationOwnerId, organizationId))
    .limit(1);

  return namespace ?? null;
}
