import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { User } from '@/types/api';
import { cachePerRequest } from './requestCache';

/**
 * Server function to check authentication
 * This runs on the server and validates the session directly (no backend call needed)
 *
 * Optimizations:
 * - Checks for session cookie before database lookup
 * - Deduplicates multiple calls within the same request/page load
 */
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  return cachePerRequest('getCurrentUser', async () => {
    try {
      // Get the request to access headers/cookies
      const request = getRequest();
      const cookies = request.headers.get('cookie');
      const authHeader = request.headers.get('authorization');

      // Early return if no cookies and no auth header
      if (!cookies && !authHeader) {
        return null;
      }

      // Lazy import to avoid circular dependency issues with Vite SSR
      const { authenticateRequest } = await import('~/server/services/auth');

      // Authenticate the request
      const user = await authenticateRequest(cookies, authHeader);

      if (!user) {
        return null;
      }

      // Convert to API User type
      const apiUser: User = {
        id: user.id,
        workosUserId: user.workosUserId,
        userType: user.userType,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt.toISOString(),
      };

      return apiUser;
    } catch (error) {
      console.error('Server auth check failed:', error);
      return null;
    }
  });
});

/**
 * Server function to handle logout
 * Clears the session cookie and revokes refresh tokens
 */
export const logoutUser = createServerFn({ method: 'POST' }).handler(async () => {
  try {
    // Get the request to access headers/cookies
    const request = getRequest();
    const cookies = request.headers.get('cookie');
    const authHeader = request.headers.get('authorization');

    // Only attempt revocation if we have auth info
    if (cookies || authHeader) {
      // Lazy import to avoid circular dependency issues with Vite SSR
      const { authenticateRequest } = await import('~/server/services/auth');
      const { revokeAllUserTokens } = await import('~/server/services/refresh-token-service');

      // Authenticate the request to get the user
      const user = await authenticateRequest(cookies, authHeader);

      if (user) {
        // Revoke all refresh tokens for this user
        await revokeAllUserTokens(user.id);
      }
    }
  } catch (error) {
    // Log but don't fail - logout should still succeed even if revocation fails
    console.error('Error during session revocation:', error);
  }

  // The client should clear the session cookie
  return { success: true };
});
