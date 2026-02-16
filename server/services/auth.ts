/**
 * Authentication Service
 *
 * Handles user authentication by:
 * 1. Extracting JWT from session cookie
 * 2. Validating the JWT
 * 3. Looking up the user in the database
 */

import { eq } from 'drizzle-orm';
import { getDb } from '~/server/db';
import { users, apiKeys } from '~/server/db/schema';
import { getJwtFromSessionCookie } from '~/server/utils/session';
import { validateToken, type TokenUser } from '~/server/utils/jwt';
import crypto from 'crypto';
import { logger } from '~/server/utils/logger';

export interface AuthenticatedUser {
  id: string;
  workosUserId: string | null;
  userType: 'HUMAN' | 'SERVICE_ACCOUNT';
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  createdAt: Date;
}

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Get user from API key (for service accounts)
 */
async function getUserFromApiKey(apiKey: string): Promise<AuthenticatedUser | null> {
  const db = getDb();
  const hashedKey = hashApiKey(apiKey);

  // Find the API key
  const [apiKeyRecord] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.hashedKey, hashedKey))
    .limit(1);

  if (!apiKeyRecord || apiKeyRecord.revokedAt) {
    return null;
  }

  // Get the associated user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, apiKeyRecord.userId))
    .limit(1);

  if (!user) {
    return null;
  }

  // Update last used timestamp (fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKeyRecord.id))
    .catch(() => {});

  return {
    id: user.id,
    workosUserId: user.workosUserId,
    userType: user.userType,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

/**
 * Get user from JWT token.
 * For WorkOS/OIDC, tokenUser.id is the provider's user id (workos_user_id).
 * For password auth, tokenUser.id is the internal user id (users.id).
 */
async function getUserFromToken(tokenUser: TokenUser): Promise<AuthenticatedUser | null> {
  const db = getDb();

  // Try by workos_user_id first (WorkOS/OIDC tokens)
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.workosUserId, tokenUser.id))
    .limit(1);

  // Fall back to users.id (password auth tokens use sub = internal user id)
  if (!user) {
    [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, tokenUser.id))
      .limit(1);
  }

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    workosUserId: user.workosUserId,
    userType: user.userType,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

/**
 * Authenticate a request and return the user
 *
 * Supports:
 * - Session cookie (JWT inside itsdangerous-signed cookie)
 * - Bearer token (JWT in Authorization header)
 * - API key (for service accounts)
 *
 * @param cookies - Cookie string from request
 * @param authHeader - Authorization header value
 * @returns The authenticated user or null
 */
export async function authenticateRequest(
  cookies: string | null,
  authHeader: string | null
): Promise<AuthenticatedUser | null> {
  let jwt: string | null = null;

  // Try to get JWT from Authorization header first
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');

    // Check if it's a service account API key
    if (token.startsWith('floww_sa_')) {
      return getUserFromApiKey(token);
    }

    jwt = token;
  }

  // If no auth header, try session cookie
  if (!jwt && cookies) {
    const sessionCookie = cookies
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('session='));

    if (sessionCookie) {
      const cookieValue = sessionCookie.split('=')[1];
      jwt = getJwtFromSessionCookie(cookieValue);
    }
  }

  if (!jwt) {
    return null;
  }

  try {
    // Validate the JWT
    const tokenUser = await validateToken(jwt);

    // Look up the user in the database
    return getUserFromToken(tokenUser);
  } catch (error) {
    logger.error('Authentication failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
