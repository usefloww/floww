/**
 * Single Organization Mode Utilities
 *
 * Provides utilities for single-organization (self-hosted) mode.
 * In this mode, all users belong to a single default organization.
 */

import { eq, count, and } from 'drizzle-orm';
import { getDb } from '~/server/db';
import { organizations, namespaces, subscriptions, users, organizationMembers } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

const SINGLE_ORG_MODE = settings.general.SINGLE_ORG_MODE;
const DEFAULT_ORG_NAME = settings.general.SINGLE_ORG_DISPLAY_NAME;

// Cache for default organization ID
let defaultOrgIdCache: string | null = null;

/**
 * Check if single-org mode is enabled
 */
export function isSingleOrgMode(): boolean {
  return SINGLE_ORG_MODE;
}

/**
 * Get or create the default organization
 */
export async function getOrCreateDefaultOrganization(): Promise<{
  organizationId: string;
  namespaceId: string;
}> {
  const db = getDb();

  // Check if we have a cached org ID
  if (defaultOrgIdCache) {
    // Verify it still exists
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, defaultOrgIdCache))
      .limit(1);

    if (org) {
      const [namespace] = await db
        .select()
        .from(namespaces)
        .where(eq(namespaces.organizationOwnerId, org.id))
        .limit(1);

      return {
        organizationId: org.id,
        namespaceId: namespace?.id ?? '',
      };
    }
    defaultOrgIdCache = null;
  }

  // Try to find an existing organization (first one)
  const [existingOrg] = await db
    .select()
    .from(organizations)
    .limit(1);

  if (existingOrg) {
    defaultOrgIdCache = existingOrg.id;

    const [namespace] = await db
      .select()
      .from(namespaces)
      .where(eq(namespaces.organizationOwnerId, existingOrg.id))
      .limit(1);

    // Create namespace if it doesn't exist
    if (!namespace) {
      const namespaceId = generateUlidUuid();
      await db.insert(namespaces).values({
        id: namespaceId,
        organizationOwnerId: existingOrg.id,
      });

      return {
        organizationId: existingOrg.id,
        namespaceId,
      };
    }

    return {
      organizationId: existingOrg.id,
      namespaceId: namespace.id,
    };
  }

  // Create default organization
  const orgId = generateUlidUuid();
  const namespaceId = generateUlidUuid();

  await db.insert(organizations).values({
    id: orgId,
    displayName: DEFAULT_ORG_NAME,
  });

  await db.insert(namespaces).values({
    id: namespaceId,
    organizationOwnerId: orgId,
  });

  // Create free subscription
  await db.insert(subscriptions).values({
    id: generateUlidUuid(),
    organizationId: orgId,
    tier: 'FREE',
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
  });

  defaultOrgIdCache = orgId;

  logger.info('Created default organization for single-org mode', {
    organizationId: orgId,
    namespaceId,
  });

  return {
    organizationId: orgId,
    namespaceId,
  };
}

/**
 * Get the default organization ID
 */
export async function getDefaultOrganizationId(): Promise<string> {
  const { organizationId } = await getOrCreateDefaultOrganization();
  return organizationId;
}

/**
 * Get the default namespace ID
 */
export async function getDefaultNamespaceId(): Promise<string> {
  const { namespaceId } = await getOrCreateDefaultOrganization();
  return namespaceId;
}

/**
 * Add a user to the default organization
 * First user becomes owner, subsequent users are members
 */
export async function addUserToDefaultOrganization(
  userId: string
): Promise<{ role: 'OWNER' | 'ADMIN' | 'MEMBER' }> {
  if (!SINGLE_ORG_MODE) {
    throw new Error('addUserToDefaultOrganization can only be used in single-org mode');
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  // Check if user is already a member
  const [existingMembership] = await db
    .select()
    .from(organizationMembers)
    .where(and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId)
    ))
    .limit(1);

  if (existingMembership) {
    return { role: existingMembership.role };
  }

  // Count existing users to determine role
  const [{ count: userCount }] = await db
    .select({ count: count() })
    .from(users);

  // First user (userCount === 1 since we already created the user) gets owner role
  const role = userCount <= 1 ? 'OWNER' : 'MEMBER';

  await db.insert(organizationMembers).values({
    id: generateUlidUuid(),
    organizationId,
    userId,
    role,
  });

  logger.info('Added user to default organization', {
    userId,
    organizationId,
    role,
  });

  return { role };
}

/**
 * Initialize single-org mode (call on startup)
 */
export async function initSingleOrgMode(): Promise<void> {
  if (!SINGLE_ORG_MODE) {
    return;
  }

  logger.info('Initializing single-org mode...');

  // Ensure default organization exists
  const { organizationId, namespaceId } = await getOrCreateDefaultOrganization();

  logger.info('Single-org mode initialized', {
    organizationId,
    namespaceId,
  });
}
