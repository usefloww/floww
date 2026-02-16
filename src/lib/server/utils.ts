import { getRequest } from '@tanstack/react-start/server';
import { User } from '@/types/api';
import { cachePerRequest } from './requestCache';

/**
 * Helper to get the current user, throwing if not authenticated.
 * Uses cachePerRequest to deduplicate calls within the same request.
 */
export async function requireUser(): Promise<User> {
  return cachePerRequest('requireUser', async () => {
    const request = getRequest();
    const cookies = request.headers.get('cookie');
    const authHeader = request.headers.get('authorization');

    if (!cookies && !authHeader) {
      throw new Error('Unauthorized');
    }

    const { authenticateRequest } = await import('~/server/services/auth');
    const user = await authenticateRequest(cookies, authHeader);

    if (!user) {
      throw new Error('Unauthorized');
    }

    return {
      id: user.id,
      workosUserId: user.workosUserId,
      userType: user.userType,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
    };
  });
}

/**
 * Helper to get the current user ID without full user object
 */
export async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}
