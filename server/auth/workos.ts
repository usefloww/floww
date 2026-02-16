/**
 * WorkOS Authentication Integration
 *
 * WorkOS is the PRIMARY authentication method for production.
 * It handles:
 * - OAuth/OIDC flows via AuthKit (Google, GitHub, etc.)
 * - SSO/SAML for enterprise customers
 * - User management
 */

import { WorkOS } from '@workos-inc/node';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

// Lazy initialization to avoid issues with Vite SSR
let _workos: WorkOS | null = null;

function getWorkOS(): WorkOS {
  if (!_workos) {
    const apiKey = settings.auth.WORKOS_API_KEY;
    if (!apiKey) {
      throw new Error('WORKOS_API_KEY not configured');
    }
    _workos = new WorkOS(apiKey);
  }
  return _workos;
}

/**
 * Get WorkOS authorization URL for AuthKit flow
 */
export function getAuthorizationUrl(
  redirectUri: string,
  state: string,
  prompt?: string
): string {
  const workos = getWorkOS();
  const clientId = settings.auth.WORKOS_CLIENT_ID;

  if (!clientId) {
    throw new Error('WORKOS_CLIENT_ID not configured');
  }

  let authUrl = workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    redirectUri,
    clientId,
    state,
  });

  // Add prompt parameter if provided (e.g., 'select_account' to force account selection)
  if (prompt) {
    const separator = authUrl.includes('?') ? '&' : '?';
    authUrl = `${authUrl}${separator}prompt=${encodeURIComponent(prompt)}`;
  }

  return authUrl;
}

/**
 * Exchange authorization code for tokens and user info
 */
export async function exchangeCodeForToken(code: string) {
  const workos = getWorkOS();
  const clientId = settings.auth.WORKOS_CLIENT_ID;

  if (!clientId) {
    throw new Error('WORKOS_CLIENT_ID not configured');
  }

  const result = await workos.userManagement.authenticateWithCode({
    code,
    clientId,
  });

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      emailVerified: result.user.emailVerified,
      profilePictureUrl: result.user.profilePictureUrl,
    },
  };
}

/**
 * Revoke a WorkOS session
 */
export async function revokeSession(accessToken: string): Promise<void> {
  try {
    const workos = getWorkOS();

    // Decode the access token to get the session ID
    // WorkOS access tokens are JWTs with a 'sid' claim
    const [, payloadB64] = accessToken.split('.');
    if (!payloadB64) return;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
    const sessionId = payload.sid;

    if (sessionId) {
      await workos.userManagement.revokeSession({ sessionId });
    }
  } catch (error) {
    // Don't fail logout if revocation fails
    logger.error('Failed to revoke WorkOS session', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Get the JWKS URL for token validation
 */
export function getJwksUrl(): string {
  const clientId = settings.auth.WORKOS_CLIENT_ID;
  if (!clientId) {
    throw new Error('WORKOS_CLIENT_ID not configured');
  }
  return `https://api.workos.com/sso/jwks/${clientId}`;
}

/**
 * Get the expected issuer for JWT validation
 */
export function getIssuer(): string {
  const clientId = settings.auth.WORKOS_CLIENT_ID;
  if (!clientId) {
    throw new Error('WORKOS_CLIENT_ID not configured');
  }
  return `https://api.workos.com/user_management/${clientId}`;
}

// Export WorkOS client getter for advanced usage
export { getWorkOS };
