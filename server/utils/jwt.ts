/**
 * JWT validation utilities
 *
 * Validates JWT tokens from WorkOS, OIDC providers, or password auth.
 */

import * as jose from 'jose';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

// Cache for JWKS
let jwksCache: jose.JSONWebKeySet | null = null;
let jwksCacheExpiry: number = 0;

/**
 * Fetch JWKS from a URL with caching
 */
async function fetchJwks(jwksUri: string): Promise<jose.JSONWebKeySet> {
  const now = Date.now();

  // Return cached JWKS if still valid (cache for 1 hour)
  if (jwksCache && jwksCacheExpiry > now) {
    return jwksCache;
  }

  const response = await fetch(jwksUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  jwksCache = (await response.json()) as jose.JSONWebKeySet;
  jwksCacheExpiry = now + 60 * 60 * 1000; // Cache for 1 hour

  return jwksCache;
}

export interface TokenUser {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  picture: string | null;
}

/**
 * Validate a WorkOS JWT token
 */
export async function validateWorkOsToken(token: string): Promise<TokenUser> {
  const clientId = settings.auth.WORKOS_CLIENT_ID;
  if (!clientId) {
    throw new Error('WORKOS_CLIENT_ID not configured');
  }

  // WorkOS JWKS URL
  const jwksUri = `https://api.workos.com/sso/jwks/${clientId}`;
  const issuer = `https://api.workos.com/user_management/${clientId}`;

  const jwks = await fetchJwks(jwksUri);
  const JWKS = jose.createLocalJWKSet(jwks);

  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer,
    });

    return {
      id: payload.sub || '',
      email: (payload.email as string) || null,
      username: (payload.preferred_username as string) || null,
      firstName: (payload.given_name as string) || null,
      lastName: (payload.family_name as string) || null,
      emailVerified: (payload.email_verified as boolean) || false,
      picture: (payload.picture as string) || null,
    };
  } catch (error) {
    logger.error('JWT validation failed', { error: error instanceof Error ? error.message : String(error) });
    throw new Error('Invalid token');
  }
}

/**
 * Validate a password auth JWT token (HS256)
 */
export async function validatePasswordAuthToken(token: string): Promise<TokenUser> {
  const secret = settings.auth.WORKFLOW_JWT_SECRET || settings.database.SESSION_SECRET_KEY;
  if (!secret) {
    throw new Error('JWT secret not configured');
  }

  const secretKey = new TextEncoder().encode(secret);

  try {
    const { payload } = await jose.jwtVerify(token, secretKey, {
      issuer: 'floww-password-auth',
    });

    return {
      id: payload.sub || '',
      email: null,
      username: null,
      firstName: null,
      lastName: null,
      emailVerified: false,
      picture: null,
    };
  } catch (error) {
    logger.error('Password auth JWT validation failed', { error: error instanceof Error ? error.message : String(error) });
    throw new Error('Invalid token');
  }
}

/**
 * Validate a JWT token (auto-detects auth type)
 */
export async function validateToken(token: string): Promise<TokenUser> {
  const authType = settings.auth.AUTH_TYPE;

  if (authType === 'password') {
    return validatePasswordAuthToken(token);
  }

  // Default to WorkOS/OIDC
  return validateWorkOsToken(token);
}

/**
 * Create a JWT token for password auth
 */
export async function createJwt(payload: { sub: string; [key: string]: unknown }): Promise<string> {
  const secret = settings.auth.WORKFLOW_JWT_SECRET || settings.database.SESSION_SECRET_KEY;
  if (!secret) {
    throw new Error('JWT secret not configured');
  }

  const secretKey = new TextEncoder().encode(secret);

  const jwt = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('floww-password-auth')
    .setExpirationTime('30d')
    .sign(secretKey);

  return jwt;
}

/**
 * Verify a JWT token for password auth
 */
export async function verifyJwt(token: string): Promise<jose.JWTPayload> {
  const secret = settings.auth.WORKFLOW_JWT_SECRET || settings.database.SESSION_SECRET_KEY;
  if (!secret) {
    throw new Error('JWT secret not configured');
  }

  const secretKey = new TextEncoder().encode(secret);

  const { payload } = await jose.jwtVerify(token, secretKey, {
    issuer: 'floww-password-auth',
  });

  return payload;
}
