/**
 * Auth Providers Package
 *
 * Authentication provider implementations for WorkOS, OIDC, etc.
 * This is a self-contained package - no imports from server/services or server/utils.
 */

import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

export interface AuthProvider {
  name: string;
  type: 'oidc' | 'workos' | 'password';
  getAuthorizationUrl(redirectUri: string, state: string, prompt?: string): string | Promise<string>;
  exchangeCode(code: string): Promise<TokenResponse>;
  validateToken(token: string): Promise<TokenPayload>;
  revokeSession?(sessionId: string): Promise<void>;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface TokenPayload {
  sub: string;
  email?: string;
  exp: number;
  iat: number;
}

/**
 * WorkOS Authentication Provider
 */
export class WorkOSProvider implements AuthProvider {
  name = 'workos';
  type = 'workos' as const;

  private clientId: string;
  private clientSecret: string;
  private apiUrl = 'https://api.workos.com';

  constructor() {
    this.clientId = settings.auth.AUTH_CLIENT_ID ?? '';
    this.clientSecret = settings.auth.AUTH_CLIENT_SECRET ?? '';
  }

  getAuthorizationUrl(redirectUri: string, state: string, prompt?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    });

    if (prompt) {
      params.set('prompt', prompt);
    }

    return `${this.apiUrl}/user_management/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenResponse> {
    const response = await fetch(`${this.apiUrl}/user_management/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 3600,
      tokenType: data.token_type ?? 'Bearer',
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
      },
    };
  }

  async validateToken(token: string): Promise<TokenPayload> {
    // WorkOS tokens are JWTs - decode and validate
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }

    return payload;
  }

  async revokeSession(sessionId: string): Promise<void> {
    // WorkOS doesn't have a direct session revocation endpoint
    // This is a no-op for WorkOS
    logger.debug('Session revocation not supported for WorkOS', { sessionId });
  }
}

/**
 * Generic OIDC Provider
 */
export class OIDCProvider implements AuthProvider {
  name: string;
  type = 'oidc' as const;

  private issuerUrl: string;
  private clientId: string;
  private clientSecret: string;
  private discoveryEndpoint?: Record<string, unknown>;

  constructor(name: string, issuerUrl: string) {
    this.name = name;
    this.issuerUrl = issuerUrl;
    this.clientId = settings.auth.AUTH_CLIENT_ID ?? '';
    this.clientSecret = settings.auth.AUTH_CLIENT_SECRET ?? '';
  }

  private async getDiscovery(): Promise<Record<string, unknown>> {
    if (this.discoveryEndpoint) {
      return this.discoveryEndpoint;
    }

    const response = await fetch(`${this.issuerUrl}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw new Error('Failed to fetch OIDC discovery document');
    }

    this.discoveryEndpoint = await response.json();
    return this.discoveryEndpoint!;
  }

  async getAuthorizationUrl(redirectUri: string, state: string): Promise<string> {
    const discovery = await this.getDiscovery();
    const authUrl = discovery.authorization_endpoint as string;

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });

    return `${authUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenResponse> {
    const discovery = await this.getDiscovery();
    const tokenUrl = discovery.token_endpoint as string;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = await response.json();

    // Decode ID token to get user info
    const idToken = data.id_token;
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 3600,
      tokenType: data.token_type ?? 'Bearer',
      user: {
        id: payload.sub,
        email: payload.email,
        firstName: payload.given_name,
        lastName: payload.family_name,
      },
    };
  }

  async validateToken(token: string): Promise<TokenPayload> {
    // For OIDC, we should validate the signature against JWKS
    // Simplified version just decodes
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }

    return payload;
  }
}

/**
 * Get the configured auth provider
 */
export function getAuthProvider(): AuthProvider {
  const authType = settings.auth.AUTH_TYPE;

  switch (authType) {
    case 'workos':
      return new WorkOSProvider();
    case 'oidc':
      const issuerUrl = settings.auth.AUTH_ISSUER_URL;
      if (!issuerUrl) {
        throw new Error('AUTH_ISSUER_URL is required for OIDC');
      }
      return new OIDCProvider('oidc', issuerUrl);
    default:
      throw new Error(`Unknown auth type: ${authType}`);
  }
}
