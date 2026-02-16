/**
 * BetterAuth Configuration
 *
 * BetterAuth is used for:
 * - Local development with username/password
 * - Testing
 * - Any username/password flows
 *
 * For production OAuth/OIDC, use WorkOS (see workos.ts)
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '~/server/db';
import { settings } from '~/server/settings';

// Lazy initialization to avoid issues with Vite SSR
let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    _auth = betterAuth({
      database: drizzleAdapter(getDb(), {
        provider: 'pg',
      }),
      emailAndPassword: {
        enabled: true,
        // Use for local development and username/password flows
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day - update session after 1 day
      },
      // Advanced configuration
      advanced: {},
      secret: settings.auth.BETTER_AUTH_SECRET,
      baseURL: settings.auth.BETTER_AUTH_URL || 'http://localhost:3000',
    });
  }
  return _auth;
}

// Export lazy getter
export const auth = {
  get api() {
    return getAuth().api;
  },
  get handler() {
    return getAuth().handler;
  },
};

export type Auth = ReturnType<typeof getAuth>;
