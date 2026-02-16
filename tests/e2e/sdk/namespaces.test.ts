/**
 * SDK E2E Tests - Namespaces
 *
 * Tests SDK namespace operations via Dashboard API routes.
 */

// IMPORTANT: Must import SDK mock first to set up node-fetch mock
import '../../setup/sdk-mock';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupSdkTestEnvironment, teardownSdkTestEnvironment } from '../../helpers/sdk-test-adapter';
import { setupSdkTest, teardownSdkTest } from '../../helpers/sdk-helpers';
import {
  createTestOrganization,
  createTestNamespace,
} from '../../helpers/factories';

beforeAll(() => {
  setupSdkTestEnvironment();
});

afterAll(() => {
  teardownSdkTestEnvironment();
  teardownSdkTest();
});

describe('SDK E2E - Namespaces', () => {
  describe('GET /api/namespaces', () => {
    it('should list namespaces for service account organization', async () => {
      const org = await createTestOrganization({ displayName: 'Test Org' });
      const namespace1 = await createTestNamespace({ organizationId: org.id });
      const namespace2 = await createTestNamespace({ organizationId: org.id });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/namespaces');

      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('total');
      expect(response.results).toHaveLength(2);
      expect(response.total).toBe(2);

      // Verify namespace structure
      const namespaceIds = response.results.map((ns: any) => ns.id);
      expect(namespaceIds).toContain(namespace1.id);
      expect(namespaceIds).toContain(namespace2.id);

      // Verify organization info is included
      expect(response.results[0]).toMatchObject({
        id: expect.any(String),
        organization: {
          id: org.id,
          displayName: 'Test Org',
        },
      });
    });

    it('should return empty list when service account has no organization', async () => {
      // Service account not in any organization
      const { client } = await setupSdkTest();

      const response = await client.apiCall('/namespaces');

      expect(response.results).toHaveLength(0);
      expect(response.total).toBe(0);
    });

    it('should list namespaces from multiple organizations', async () => {
      const org1 = await createTestOrganization({ displayName: 'Org One' });
      const org2 = await createTestOrganization({ displayName: 'Org Two' });

      const namespace1 = await createTestNamespace({ organizationId: org1.id });
      const namespace2 = await createTestNamespace({ organizationId: org2.id });

      // Create service account in org1
      const { createTestServiceAccount } = await import('../../helpers/sdk-helpers');
      const serviceAccount = await createTestServiceAccount(org1.id);

      // Add service account to org2
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

      const response = await client.apiCall('/namespaces');

      // Should see namespaces from both organizations
      expect(response.results).toHaveLength(2);
      const namespaceIds = response.results.map((ns: any) => ns.id);
      expect(namespaceIds).toContain(namespace1.id);
      expect(namespaceIds).toContain(namespace2.id);

      // Verify organization info
      const orgNames = response.results.map((ns: any) => ns.organization.displayName);
      expect(orgNames).toContain('Org One');
      expect(orgNames).toContain('Org Two');
    });

    it('should only return namespaces user has access to', async () => {
      const org1 = await createTestOrganization();
      const org2 = await createTestOrganization();

      const namespace1 = await createTestNamespace({ organizationId: org1.id });
      const namespace2 = await createTestNamespace({ organizationId: org2.id });

      // Service account only in org1
      const { client } = await setupSdkTest({ organizationId: org1.id });

      const response = await client.apiCall('/namespaces');

      // Should only see org1 namespace
      expect(response.results).toHaveLength(1);
      expect(response.results[0].id).toBe(namespace1.id);

      const namespaceIds = response.results.map((ns: any) => ns.id);
      expect(namespaceIds).not.toContain(namespace2.id);
    });

    it('should require authentication', async () => {
      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const client = new TokenApiClient('http://localhost:3000', 'invalid-token');

      await expect(client.apiCall('/namespaces')).rejects.toThrow();
    });
  });

  describe('GET /api/namespaces/:id', () => {
    it('should get namespace details by id', async () => {
      const org = await createTestOrganization({ displayName: 'Test Org' });
      const namespace = await createTestNamespace({ organizationId: org.id });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/namespaces/${namespace.id}`);

      expect(response).toMatchObject({
        id: namespace.id,
        organization: {
          id: org.id,
          displayName: 'Test Org',
        },
        createdAt: expect.any(String),
      });
    });

    it('should return 404 for non-existent namespace', async () => {
      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      await expect(client.apiCall('/namespaces/non-existent-id')).rejects.toThrow(
        /not found/
      );
    });

    it('should deny access to namespaces in other organizations', async () => {
      const org1 = await createTestOrganization();
      const org2 = await createTestOrganization();

      const namespace2 = await createTestNamespace({ organizationId: org2.id });

      // Service account only in org1
      const { client } = await setupSdkTest({ organizationId: org1.id });

      await expect(client.apiCall(`/namespaces/${namespace2.id}`)).rejects.toThrow(
        /not found/
      );
    });

    it('should allow access to namespace in accessible organization', async () => {
      const org = await createTestOrganization({ displayName: 'My Org' });
      const namespace = await createTestNamespace({ organizationId: org.id });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/namespaces/${namespace.id}`);

      expect(response.id).toBe(namespace.id);
      expect(response.organization.id).toBe(org.id);
    });

    it('should include creation timestamp', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/namespaces/${namespace.id}`);

      expect(response.createdAt).toBeDefined();
      expect(typeof response.createdAt).toBe('string');
      // Verify it's a valid ISO 8601 date string
      expect(() => new Date(response.createdAt)).not.toThrow();
    });
  });

  describe('Namespace access control', () => {
    it('should respect organization membership for namespace access', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });

      // Create service account in org
      const { createTestServiceAccount } = await import('../../helpers/sdk-helpers');
      const serviceAccount = await createTestServiceAccount(org.id);

      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const client = new TokenApiClient('http://localhost:3000', serviceAccount.apiKey);

      // Should have access
      const response = await client.apiCall(`/namespaces/${namespace.id}`);
      expect(response.id).toBe(namespace.id);

      // Remove from organization
      const { getTestDb } = await import('../../setup/global-setup');
      const { organizationMembers } = await import('~/server/db/schema');
      const { eq, and } = await import('drizzle-orm');

      await getTestDb()
        .delete(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, serviceAccount.user.id),
            eq(organizationMembers.organizationId, org.id)
          )
        );

      // Should no longer have access
      await expect(client.apiCall(`/namespaces/${namespace.id}`)).rejects.toThrow(
        /not found/
      );
    });
  });
});
