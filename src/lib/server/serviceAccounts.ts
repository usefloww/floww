import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ServiceAccountInfo {
  id: string;
  name: string;
  organizationId: string;
  apiKeys: ApiKeyInfo[];
}

export interface ApiKeyCreatedInfo {
  id: string;
  name: string;
  prefix: string;
  apiKey: string; // Full key, only returned once
  createdAt: string;
}

/**
 * List service accounts for an organization
 */
export const getServiceAccounts = createServerFn({ method: 'GET' })
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data }): Promise<{ results: ServiceAccountInfo[] }> => {
    const user = await requireUser();
    const { getDb } = await import('~/server/db');
    const { eq, and } = await import('drizzle-orm');
    const { users, apiKeys, organizationMembers } = await import('~/server/db/schema');

    const db = getDb();

    // Verify user has access to the organization
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, data.organizationId),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);

    if (membership.length === 0 && !user.isAdmin) {
      throw new Error('Access denied');
    }

    // Get service accounts that are members of this org
    const serviceAccountMembers = await db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
      .where(
        and(
          eq(users.userType, 'SERVICE_ACCOUNT'),
          eq(organizationMembers.organizationId, data.organizationId)
        )
      );

    // For each service account, get its API keys
    const results = await Promise.all(
      serviceAccountMembers.map(async (sa) => {
        const keys = await db
          .select({
            id: apiKeys.id,
            name: apiKeys.name,
            prefix: apiKeys.prefix,
            createdAt: apiKeys.createdAt,
            lastUsedAt: apiKeys.lastUsedAt,
            revokedAt: apiKeys.revokedAt,
          })
          .from(apiKeys)
          .where(eq(apiKeys.userId, sa.id));

        return {
          id: sa.id,
          name: sa.username || 'Unnamed Service Account',
          organizationId: data.organizationId,
          apiKeys: keys.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            createdAt: k.createdAt?.toISOString() || new Date().toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            revokedAt: k.revokedAt?.toISOString() ?? null,
          })),
        };
      })
    );

    return { results };
  });

/**
 * Create a service account
 */
export const createServiceAccount = createServerFn({ method: 'POST' })
  .inputValidator((input: { organizationId: string; name: string }) => input)
  .handler(async ({ data }): Promise<ServiceAccountInfo> => {
    const user = await requireUser();
    const { getDb } = await import('~/server/db');
    const { eq, and } = await import('drizzle-orm');
    const { users, organizationMembers } = await import('~/server/db/schema');
    const { generateUlidUuid } = await import('~/server/utils/uuid');

    const db = getDb();

    // Verify user has access to the organization
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, data.organizationId),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);

    if (membership.length === 0 && !user.isAdmin) {
      throw new Error('Access denied');
    }

    // Create service account user
    const saId = generateUlidUuid();
    const result = await db
      .insert(users)
      .values({
        id: saId,
        userType: 'SERVICE_ACCOUNT',
        username: data.name,
      })
      .returning();

    const serviceAccount = result[0];

    // Add service account to organization
    await db.insert(organizationMembers).values({
      id: generateUlidUuid(),
      organizationId: data.organizationId,
      userId: saId,
      role: 'MEMBER',
    });

    return {
      id: serviceAccount.id,
      name: serviceAccount.username || data.name,
      organizationId: data.organizationId,
      apiKeys: [],
    };
  });

/**
 * Delete a service account
 */
export const deleteServiceAccount = createServerFn({ method: 'POST' })
  .inputValidator((input: { serviceAccountId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { getDb } = await import('~/server/db');
    const { eq, and } = await import('drizzle-orm');
    const { users, organizationMembers } = await import('~/server/db/schema');

    const db = getDb();

    // Verify it's a service account and get org
    const results = await db
      .select({
        id: users.id,
        organizationId: organizationMembers.organizationId,
      })
      .from(users)
      .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
      .where(and(eq(users.id, data.serviceAccountId), eq(users.userType, 'SERVICE_ACCOUNT')))
      .limit(1);

    if (results.length === 0) {
      throw new Error('Service account not found');
    }

    const sa = results[0];

    // Verify user has access to this org
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, sa.organizationId),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);

    if (membership.length === 0 && !user.isAdmin) {
      throw new Error('Access denied');
    }

    // Delete the user (cascades to API keys and org membership)
    await db.delete(users).where(eq(users.id, data.serviceAccountId));

    return { success: true };
  });

/**
 * Create an API key for a service account
 */
export const createApiKey = createServerFn({ method: 'POST' })
  .inputValidator((input: { serviceAccountId: string; name: string }) => input)
  .handler(async ({ data }): Promise<ApiKeyCreatedInfo> => {
    const user = await requireUser();
    const { getDb } = await import('~/server/db');
    const { eq, and } = await import('drizzle-orm');
    const { users, apiKeys, organizationMembers } = await import('~/server/db/schema');
    const { generateApiKey: genKey, hashApiKey } = await import('~/server/utils/encryption');

    const db = getDb();

    // Verify it's a service account and get org
    const results = await db
      .select({
        id: users.id,
        organizationId: organizationMembers.organizationId,
      })
      .from(users)
      .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
      .where(and(eq(users.id, data.serviceAccountId), eq(users.userType, 'SERVICE_ACCOUNT')))
      .limit(1);

    if (results.length === 0) {
      throw new Error('Service account not found');
    }

    const sa = results[0];

    // Verify user has access to this org
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, sa.organizationId),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);

    if (membership.length === 0 && !user.isAdmin) {
      throw new Error('Access denied');
    }

    // Generate API key
    const [plaintext, prefix] = genKey();
    const hash = hashApiKey(plaintext);

    const result = await db
      .insert(apiKeys)
      .values({
        name: data.name,
        prefix,
        hashedKey: hash,
        userId: data.serviceAccountId,
      })
      .returning();

    const key = result[0];

    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      apiKey: plaintext, // Only returned once!
      createdAt: key.createdAt?.toISOString() || new Date().toISOString(),
    };
  });

/**
 * Revoke an API key
 */
export const revokeApiKey = createServerFn({ method: 'POST' })
  .inputValidator((input: { serviceAccountId: string; apiKeyId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { getDb } = await import('~/server/db');
    const { eq, and, isNull } = await import('drizzle-orm');
    const { users, apiKeys, organizationMembers } = await import('~/server/db/schema');

    const db = getDb();

    // Verify it's a service account and get org
    const results = await db
      .select({
        id: users.id,
        organizationId: organizationMembers.organizationId,
      })
      .from(users)
      .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
      .where(and(eq(users.id, data.serviceAccountId), eq(users.userType, 'SERVICE_ACCOUNT')))
      .limit(1);

    if (results.length === 0) {
      throw new Error('Service account not found');
    }

    const sa = results[0];

    // Verify user has access to this org
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, sa.organizationId),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);

    if (membership.length === 0 && !user.isAdmin) {
      throw new Error('Access denied');
    }

    // Verify key belongs to this service account and is not already revoked
    const keyResult = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.id, data.apiKeyId),
          eq(apiKeys.userId, data.serviceAccountId),
          isNull(apiKeys.revokedAt)
        )
      )
      .limit(1);

    if (keyResult.length === 0) {
      throw new Error('API key not found or already revoked');
    }

    // Revoke the key
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, data.apiKeyId));

    return { success: true };
  });
