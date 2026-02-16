/**
 * SDK E2E Tests - Dev Mode
 *
 * Tests SDK dev mode operations via Dashboard API routes.
 */

// IMPORTANT: Must import SDK mock first to set up node-fetch mock
import '../../setup/sdk-mock';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupSdkTestEnvironment, teardownSdkTestEnvironment } from '../../helpers/sdk-test-adapter';
import { setupSdkTest, teardownSdkTest } from '../../helpers/sdk-helpers';
import {
  createTestOrganization,
  createTestNamespace,
  createTestWorkflow,
  createTestRuntime,
  createTestWorkflowDeployment,
} from '../../helpers/factories';

beforeAll(() => {
  setupSdkTestEnvironment();
});

afterAll(() => {
  teardownSdkTestEnvironment();
  teardownSdkTest();
});

describe('SDK E2E - Dev Mode', () => {
  describe('POST /api/dev/sync-triggers', () => {
    // Save original NODE_ENV
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      // Set to development mode for these tests
      process.env.NODE_ENV = 'development';
    });

    afterAll(() => {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });

    it('should sync triggers for all active deployments', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id, null, {
        name: 'Test Workflow',
        triggersMetadata: [
          {
            type: 'webhook',
            path: '/test-webhook',
          },
        ],
      });
      const runtime = await createTestRuntime();
      await createTestWorkflowDeployment(workflow.id, runtime.id, null, {
        status: 'ACTIVE',
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/dev/sync-triggers', {
        method: 'POST',
      });

      expect(response).toHaveProperty('synced');
      expect(response).toHaveProperty('failed');
      expect(response).toHaveProperty('results');

      // Should have at least one successful sync
      expect(response.synced).toBeGreaterThanOrEqual(1);
      expect(response.results).toBeInstanceOf(Array);
    });

    it('should only sync ACTIVE deployments', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id);
      const runtime = await createTestRuntime();

      // Create one ACTIVE and one INACTIVE deployment
      const activeDeployment = await createTestWorkflowDeployment(
        workflow.id,
        runtime.id,
        null,
        { status: 'ACTIVE' }
      );
      const inactiveDeployment = await createTestWorkflowDeployment(
        workflow.id,
        runtime.id,
        null,
        { status: 'INACTIVE' }
      );

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/dev/sync-triggers', {
        method: 'POST',
      });

      // Results should only include the ACTIVE deployment
      const deploymentIds = response.results.map((r: any) => r.deploymentId);
      expect(deploymentIds).toContain(activeDeployment.id);
      expect(deploymentIds).not.toContain(inactiveDeployment.id);
    });

    it('should return empty results when no active deployments exist', async () => {
      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/dev/sync-triggers', {
        method: 'POST',
      });

      expect(response.synced).toBe(0);
      expect(response.failed).toBe(0);
      expect(response.results).toHaveLength(0);
    });

    it('should handle multiple deployments', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const runtime = await createTestRuntime();

      // Create multiple workflows with deployments
      const workflow1 = await createTestWorkflow(namespace.id, null, {
        name: 'Workflow 1',
      });
      const workflow2 = await createTestWorkflow(namespace.id, null, {
        name: 'Workflow 2',
      });

      await createTestWorkflowDeployment(workflow1.id, runtime.id, null, {
        status: 'ACTIVE',
      });
      await createTestWorkflowDeployment(workflow2.id, runtime.id, null, {
        status: 'ACTIVE',
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/dev/sync-triggers', {
        method: 'POST',
      });

      expect(response.results).toHaveLength(2);
      expect(response.synced).toBe(2);
    });

    it('should report sync errors for individual deployments', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id, null, {
        name: 'Bad Workflow',
        // Invalid triggers metadata that might cause sync errors
        triggersMetadata: 'invalid' as any,
      });
      const runtime = await createTestRuntime();
      await createTestWorkflowDeployment(workflow.id, runtime.id, null, {
        status: 'ACTIVE',
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/dev/sync-triggers', {
        method: 'POST',
      });

      // The endpoint should still return a response even if sync fails
      expect(response).toHaveProperty('results');
      expect(response.results.length).toBeGreaterThan(0);

      // Check if any failures were reported
      if (response.failed > 0) {
        const failedResult = response.results.find((r: any) => r.status === 'error');
        expect(failedResult).toBeDefined();
        expect(failedResult.error).toBeDefined();
      }
    });

    it('should require authentication', async () => {
      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const client = new TokenApiClient('http://localhost:3000', 'invalid-token');

      await expect(
        client.apiCall('/dev/sync-triggers', {
          method: 'POST',
        })
      ).rejects.toThrow();
    });

    it('should be restricted in production mode for non-admin users', async () => {
      // Switch to production mode
      process.env.NODE_ENV = 'production';

      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      await expect(
        client.apiCall('/dev/sync-triggers', {
          method: 'POST',
        })
      ).rejects.toThrow(/only available in development/);

      // Restore development mode
      process.env.NODE_ENV = 'development';
    });

    it('should allow admin users in production mode', async () => {
      // Switch to production mode
      process.env.NODE_ENV = 'production';

      const org = await createTestOrganization();

      // Create admin service account
      const { getTestDb } = await import('../../setup/global-setup');
      const { users, apiKeys, organizationMembers } = await import('~/server/db/schema');
      const { generateUlidUuid } = await import('~/server/utils/uuid');
      const { generateApiKey, hashApiKey } = await import('~/server/utils/encryption');

      const [plaintext, prefix] = generateApiKey();
      const hash = hashApiKey(plaintext);

      const [adminUser] = await getTestDb()
        .insert(users)
        .values({
          id: generateUlidUuid(),
          userType: 'SERVICE_ACCOUNT',
          username: 'admin-sa',
          isAdmin: true, // Make it admin
        })
        .returning();

      await getTestDb().insert(organizationMembers).values({
        id: generateUlidUuid(),
        organizationId: org.id,
        userId: adminUser.id,
        role: 'MEMBER',
      });

      await getTestDb().insert(apiKeys).values({
        name: 'admin-key',
        prefix,
        hashedKey: hash,
        userId: adminUser.id,
      });

      // Use admin client
      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const adminClient = new TokenApiClient('http://localhost:3000', plaintext);

      // Should succeed for admin
      const response = await adminClient.apiCall('/dev/sync-triggers', {
        method: 'POST',
      });

      expect(response).toHaveProperty('synced');
      expect(response).toHaveProperty('failed');

      // Restore development mode
      process.env.NODE_ENV = 'development';
    });
  });
});
