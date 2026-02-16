import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export type AccessRole = 'OWNER' | 'USER';

export interface ProviderAccessEntry {
  id: string;
  userId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  role: AccessRole;
}

/**
 * Get users with access to a provider
 */
export const getProviderAccess = createServerFn({ method: 'GET' })
  .inputValidator((input: { providerId: string }) => input)
  .handler(async ({ data }): Promise<{ results: ProviderAccessEntry[] }> => {
    const user = await requireUser();
    const { hasProviderAccess } = await import('~/server/services/provider-service');
    const { getDb } = await import('~/server/db');
    const { eq, and } = await import('drizzle-orm');
    const { providerAccess, users } = await import('~/server/db/schema');

    const hasAccess = await hasProviderAccess(user.id, data.providerId);
    if (!hasAccess && !user.isAdmin) {
      throw new Error('Provider not found');
    }

    const db = getDb();

    const accessList = await db
      .select({
        id: providerAccess.id,
        userId: providerAccess.principleId,
        role: providerAccess.role,
        user: {
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(providerAccess)
      .innerJoin(users, eq(providerAccess.principleId, users.id))
      .where(
        and(
          eq(providerAccess.resourceType, 'PROVIDER'),
          eq(providerAccess.resourceId, data.providerId),
          eq(providerAccess.principleType, 'USER')
        )
      );

    return {
      results: accessList.map((a) => ({
        id: a.id,
        userId: a.userId,
        userEmail: a.user.email,
        userFirstName: a.user.firstName,
        userLastName: a.user.lastName,
        role: a.role,
      })),
    };
  });

/**
 * Grant a user access to a provider
 */
export const grantProviderAccess = createServerFn({ method: 'POST' })
  .inputValidator((input: { providerId: string; userId: string; role: AccessRole }) => input)
  .handler(async ({ data }): Promise<ProviderAccessEntry> => {
    const user = await requireUser();
    const { getResolvedAccess, grantAccess } = await import('~/server/services/access-service');
    const { getDb } = await import('~/server/db');
    const { eq } = await import('drizzle-orm');
    const { users } = await import('~/server/db/schema');

    // Verify user has owner access
    const userRole = await getResolvedAccess('USER', user.id, 'PROVIDER', data.providerId);
    if (userRole !== 'OWNER' && !user.isAdmin) {
      throw new Error('You must be an owner of the provider to grant access');
    }

    // Verify target user exists
    const db = getDb();
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, data.userId))
      .limit(1);

    if (!targetUser) {
      throw new Error('User not found');
    }

    // Grant access
    const accessRecord = await grantAccess('USER', data.userId, 'PROVIDER', data.providerId, data.role);

    return {
      id: accessRecord.id,
      userId: data.userId,
      userEmail: targetUser.email,
      userFirstName: targetUser.firstName,
      userLastName: targetUser.lastName,
      role: data.role,
    };
  });

/**
 * Update a user's role for a provider
 */
export const updateProviderAccessRole = createServerFn({ method: 'POST' })
  .inputValidator((input: { providerId: string; userId: string; role: AccessRole }) => input)
  .handler(async ({ data }): Promise<{ userId: string; role: AccessRole }> => {
    const user = await requireUser();
    const { getResolvedAccess } = await import('~/server/services/access-service');
    const { getDb } = await import('~/server/db');
    const { eq, and } = await import('drizzle-orm');
    const { providerAccess } = await import('~/server/db/schema');

    // Verify user has owner access
    const userRole = await getResolvedAccess('USER', user.id, 'PROVIDER', data.providerId);
    if (userRole !== 'OWNER' && !user.isAdmin) {
      throw new Error('You must be an owner of the provider to update access');
    }

    const db = getDb();

    const result = await db
      .update(providerAccess)
      .set({ role: data.role })
      .where(
        and(
          eq(providerAccess.principleType, 'USER'),
          eq(providerAccess.principleId, data.userId),
          eq(providerAccess.resourceType, 'PROVIDER'),
          eq(providerAccess.resourceId, data.providerId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new Error('Access grant not found');
    }

    return { userId: data.userId, role: data.role };
  });

/**
 * Revoke a user's access to a provider
 */
export const revokeProviderAccess = createServerFn({ method: 'POST' })
  .inputValidator((input: { providerId: string; userId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { getResolvedAccess, revokeAccess } = await import('~/server/services/access-service');

    // Verify user has owner access
    const userRole = await getResolvedAccess('USER', user.id, 'PROVIDER', data.providerId);
    if (userRole !== 'OWNER' && !user.isAdmin) {
      throw new Error('You must be an owner of the provider to revoke access');
    }

    await revokeAccess('USER', data.userId, 'PROVIDER', data.providerId);

    return { success: true };
  });
