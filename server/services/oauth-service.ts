/**
 * OAuth Service
 *
 * Handles OAuth flows for third-party integrations (Google, etc.)
 * Instance-level OAuth app credentials come from environment settings.
 * User-level tokens are stored per-provider in encrypted_config.
 */

import { settings } from '~/server/settings';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  tokenType: string;
  scope: string | null;
}

export interface OAuthProvider {
  name: string;
  isConfigured(): boolean;
  getAuthorizationUrl(scopes: string[], state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
}

/**
 * Google OAuth 2.0 implementation
 */
export class GoogleOAuthProvider implements OAuthProvider {
  private static AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  private static TOKEN_URL = 'https://oauth2.googleapis.com/token';

  private clientId: string;
  private clientSecret: string;

  name = 'google';

  constructor() {
    this.clientId = settings.oauth.GOOGLE_OAUTH_CLIENT_ID;
    this.clientSecret = settings.oauth.GOOGLE_OAUTH_CLIENT_SECRET;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  getAuthorizationUrl(scopes: string[], state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'offline', // Request refresh token
      prompt: 'consent', // Force consent to always get refresh token
    });
    return `${GoogleOAuthProvider.AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch(GoogleOAuthProvider.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = await response.json();

    const expiresIn = data.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt,
      tokenType: data.token_type ?? 'Bearer',
      scope: data.scope ?? null,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(GoogleOAuthProvider.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh tokens: ${error}`);
    }

    const data = await response.json();

    const expiresIn = data.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      accessToken: data.access_token,
      // Google may not return a new refresh token
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt,
      tokenType: data.token_type ?? 'Bearer',
      scope: data.scope ?? null,
    };
  }
}

// Registry of OAuth providers
const OAUTH_PROVIDERS: Record<string, new () => OAuthProvider> = {
  google: GoogleOAuthProvider,
};

/**
 * Get an OAuth provider instance by name
 */
export function getOAuthProvider(providerName: string): OAuthProvider {
  const ProviderClass = OAUTH_PROVIDERS[providerName];
  if (!ProviderClass) {
    throw new Error(`Unknown OAuth provider: ${providerName}`);
  }
  return new ProviderClass();
}

/**
 * List available OAuth provider names
 */
export function listOAuthProviders(): string[] {
  return Object.keys(OAUTH_PROVIDERS);
}

/**
 * Serialize OAuth tokens for storage
 */
export function serializeTokens(tokens: OAuthTokens): Record<string, unknown> {
  return {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt.toISOString(),
    token_type: tokens.tokenType,
    scope: tokens.scope,
  };
}

/**
 * Deserialize OAuth tokens from storage
 */
export function deserializeTokens(data: Record<string, unknown>): OAuthTokens {
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? null,
    expiresAt: new Date(data.expires_at as string),
    tokenType: (data.token_type as string) ?? 'Bearer',
    scope: (data.scope as string) ?? null,
  };
}

/**
 * Check if tokens are expired
 */
export function areTokensExpired(tokens: OAuthTokens, bufferSeconds: number = 60): boolean {
  const now = Date.now();
  const expiresAtMs = tokens.expiresAt.getTime();
  return now + bufferSeconds * 1000 >= expiresAtMs;
}
