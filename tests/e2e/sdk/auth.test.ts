/**
 * SDK E2E Tests - Authentication
 *
 * Tests SDK authentication flows via Dashboard API routes.
 */

// IMPORTANT: Must import SDK mock first to set up node-fetch mock
import '../../setup/sdk-mock';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupSdkTestEnvironment, teardownSdkTestEnvironment } from '../../helpers/sdk-test-adapter';
import {
  createTestServiceAccount,
  setupSdkTest,
  teardownSdkTest,
} from '../../helpers/sdk-helpers';
import {
  createTestUser,
  createTestOrganization,
  addUserToOrganization,
} from '../../helpers/factories';
import type { TestServiceAccount } from '../../helpers/sdk-helpers';

// Set up SDK test environment once for all tests
beforeAll(() => {
  setupSdkTestEnvironment();
});

afterAll(() => {
  teardownSdkTestEnvironment();
});

afterAll(() => {
  teardownSdkTest();
});

describe('SDK E2E - Authentication', () => {
  describe('GET /api/whoami', () => {
    it('should return service account info when authenticated', async () => {
      // Create an organization and service account
      const org = await createTestOrganization({ displayName: 'Test Organization' });
      const { serviceAccount, client } = await setupSdkTest({ organizationId: org.id });

      // Call whoami via SDK
      const response = await client.apiCall('/whoami');

      // Verify response structure
      expect(response).toHaveProperty('user');
      expect(response).toHaveProperty('organizations');

      // Verify user info
      expect(response.user).toMatchObject({
        id: serviceAccount.user.id,
        userType: 'SERVICE_ACCOUNT',
      });

      // Verify organizations
      expect(response.organizations).toHaveLength(1);
      expect(response.organizations[0]).toMatchObject({
        id: org.id,
        displayName: 'Test Organization',
      });
    });

    it('should return empty organizations for service account without org', async () => {
      // Create service account without an organization
      const { serviceAccount, client } = await setupSdkTest();

      // Call whoami via SDK
      const response = await client.apiCall('/whoami');

      // Verify response
      expect(response.user.id).toBe(serviceAccount.user.id);
      expect(response.organizations).toHaveLength(0);
    });

    it('should return 401 when not authenticated', async () => {
      // Import TokenApiClient to create client without auth
      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');

      // Create client with invalid token
      const client = new TokenApiClient('http://localhost:3000', 'invalid-token');

      // Call whoami should fail
      await expect(client.apiCall('/whoami')).rejects.toThrow(/Invalid API token/);
    });

    it('should work with service account in multiple organizations', async () => {
      // Create two organizations
      const org1 = await createTestOrganization({ displayName: 'Org One' });
      const org2 = await createTestOrganization({ displayName: 'Org Two' });

      // Create service account
      const serviceAccount = await createTestServiceAccount(org1.id);

      // Add service account to second organization
      const { getTestDb } = await import('../../setup/global-setup');
      const { organizationMembers } = await import('~/server/db/schema');
      const { generateUlidUuid } = await import('~/server/utils/uuid');

      await getTestDb().insert(organizationMembers).values({
        id: generateUlidUuid(),
        organizationId: org2.id,
        userId: serviceAccount.user.id,
        role: 'MEMBER',
      });

      // Set up SDK client
      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const client = new TokenApiClient('http://localhost:3000', serviceAccount.apiKey);

      // Call whoami
      const response = await client.apiCall('/whoami');

      // Verify both organizations are returned
      expect(response.organizations).toHaveLength(2);
      const orgIds = response.organizations.map((o: any) => o.id);
      expect(orgIds).toContain(org1.id);
      expect(orgIds).toContain(org2.id);
    });
  });

  describe('Token validation', () => {
    it('should reject requests with malformed tokens', async () => {
      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const client = new TokenApiClient('http://localhost:3000', 'not-a-real-token');

      await expect(client.apiCall('/whoami')).rejects.toThrow(/Invalid API token/);
    });

    it('should reject requests with empty token', async () => {
      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');

      // This should throw when constructing the client
      expect(() => new TokenApiClient('http://localhost:3000', '')).toThrow(
        /Token is required/
      );
    });

    it('should reject requests with revoked API key', async () => {
      // Create service account
      const org = await createTestOrganization();
      const serviceAccount = await createTestServiceAccount(org.id);

      // Revoke the API key
      const { getTestDb } = await import('../../setup/global-setup');
      const { apiKeys } = await import('~/server/db/schema');
      const { eq } = await import('drizzle-orm');

      await getTestDb()
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, serviceAccount.apiKeyId));

      // Try to use the revoked key
      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const client = new TokenApiClient('http://localhost:3000', serviceAccount.apiKey);

      await expect(client.apiCall('/whoami')).rejects.toThrow(/Invalid API token/);
    });
  });

  describe('Service account behavior', () => {
    it('should identify as SERVICE_ACCOUNT userType', async () => {
      const { serviceAccount, client } = await setupSdkTest();

      const response = await client.apiCall('/whoami');

      expect(response.user.userType).toBe('SERVICE_ACCOUNT');
    });

    it('should not be admin by default', async () => {
      const { client } = await setupSdkTest();

      const response = await client.apiCall('/whoami');

      expect(response.user.isAdmin).toBe(false);
    });

    it('should have null email, firstName, and lastName', async () => {
      const { client } = await setupSdkTest();

      const response = await client.apiCall('/whoami');

      expect(response.user.email).toBeNull();
      expect(response.user.firstName).toBeNull();
      expect(response.user.lastName).toBeNull();
    });
  });
});
