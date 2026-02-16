/**
 * SDK Test Helpers
 *
 * Utilities for creating and configuring the floww-sdk for testing.
 */

import { getTestDb } from '../setup/global-setup';
import {
  users,
  apiKeys,
  organizationMembers,
  type User,
} from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { generateApiKey, hashApiKey } from '~/server/utils/encryption';
import { setSdkToken, clearSdkToken } from './sdk-test-adapter';

/**
 * Service account with API key info
 */
export interface TestServiceAccount {
  user: User;
  apiKey: string; // Full plaintext API key (floww_sa_xxx...)
  prefix: string; // Key prefix
  apiKeyId: string;
}

/**
 * Create a test service account with an API key
 *
 * This creates a SERVICE_ACCOUNT user and generates an API key for it.
 * The service account is optionally added to an organization.
 *
 * @param organizationId Optional organization to add the service account to
 * @param name Optional name for the service account (defaults to auto-generated)
 * @returns Service account info including the plaintext API key
 */
export async function createTestServiceAccount(
  organizationId?: string,
  name?: string
): Promise<TestServiceAccount> {
  const db = getTestDb();

  // Generate unique ID for service account
  const saId = generateUlidUuid();
  const saName = name || `test-sa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Create service account user
  const [user] = await db
    .insert(users)
    .values({
      id: saId,
      userType: 'SERVICE_ACCOUNT',
      username: saName,
    })
    .returning();

  // Add to organization if provided
  if (organizationId) {
    await db.insert(organizationMembers).values({
      id: generateUlidUuid(),
      organizationId,
      userId: saId,
      role: 'MEMBER',
    });
  }

  // Generate API key
  const [plaintext, prefix] = generateApiKey();
  const hash = hashApiKey(plaintext);

  const [key] = await db
    .insert(apiKeys)
    .values({
      name: `${saName}-key`,
      prefix,
      hashedKey: hash,
      userId: saId,
    })
    .returning();

  return {
    user,
    apiKey: plaintext,
    prefix,
    apiKeyId: key.id,
  };
}

/**
 * Configure SDK environment for testing with a service account
 *
 * This sets up the FLOWW_TOKEN environment variable so the SDK
 * will use the provided service account for authentication.
 *
 * @param serviceAccount Service account created with createTestServiceAccount
 */
export function useSdkServiceAccount(serviceAccount: TestServiceAccount) {
  setSdkToken(serviceAccount.apiKey);
}

/**
 * Clear SDK authentication
 *
 * Removes the FLOWW_TOKEN environment variable.
 */
export function clearSdkAuth() {
  clearSdkToken();
}

/**
 * Create an SDK API client for testing
 *
 * This is a convenience function that creates a TokenApiClient
 * configured to work with the test environment.
 *
 * Note: You must import TokenApiClient from the SDK package yourself.
 *
 * @param baseUrl Base URL for the API (default: http://localhost:3000)
 * @param token API token to use
 * @returns Configured TokenApiClient
 */
export async function createSdkClient(
  baseUrl: string = 'http://localhost:3000',
  token: string
) {
  // Import directly from SDK source in monorepo
  const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
  return new TokenApiClient(baseUrl, token);
}

/**
 * Setup function for SDK e2e tests
 *
 * Creates a service account, configures the SDK environment,
 * and returns everything needed for testing.
 *
 * @param options Configuration options
 * @param options.organizationId Optional organization to add service account to
 * @param options.baseUrl Base URL for the API (default: http://localhost:3000)
 * @returns Service account and SDK client
 */
export async function setupSdkTest(options?: {
  organizationId?: string;
  baseUrl?: string;
}) {
  const serviceAccount = await createTestServiceAccount(
    options?.organizationId,
    undefined
  );

  useSdkServiceAccount(serviceAccount);

  const client = await createSdkClient(
    options?.baseUrl || 'http://localhost:3000',
    serviceAccount.apiKey
  );

  return {
    serviceAccount,
    client,
  };
}

/**
 * Teardown function for SDK e2e tests
 *
 * Clears SDK authentication.
 */
export function teardownSdkTest() {
  clearSdkAuth();
}
