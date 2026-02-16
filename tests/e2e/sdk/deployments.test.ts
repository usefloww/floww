/**
 * SDK E2E Tests - Deployments
 *
 * Tests SDK deployment and runtime operations via Dashboard API routes.
 */

// IMPORTANT: Must import SDK mock first to set up node-fetch mock
import '../../setup/sdk-mock';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('SDK E2E - Runtimes', () => {
  describe('GET /api/runtimes', () => {
    it('should list available runtimes', async () => {
      // Create some test runtimes
      await createTestRuntime({ creationStatus: 'COMPLETED' });
      await createTestRuntime({ creationStatus: 'COMPLETED' });

      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/runtimes');

      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('defaultRuntimeId');
      expect(response.results.length).toBeGreaterThanOrEqual(2);

      // Verify runtime structure
      expect(response.results[0]).toMatchObject({
        id: expect.any(String),
        config: expect.any(Object),
        configHash: expect.any(String),
        creationStatus: expect.any(String),
        createdAt: expect.any(String),
        isDefault: expect.any(Boolean),
      });
    });

    it('should filter runtimes by status', async () => {
      await createTestRuntime({ creationStatus: 'COMPLETED' });
      await createTestRuntime({ creationStatus: 'IN_PROGRESS' });

      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/runtimes?status=COMPLETED');

      expect(response.results).toBeInstanceOf(Array);
      // All results should have COMPLETED status
      const statuses = response.results.map((r: any) => r.creationStatus);
      expect(statuses.every((s: string) => s === 'COMPLETED')).toBe(true);
    });

    it('should support pagination', async () => {
      // Create multiple runtimes
      for (let i = 0; i < 5; i++) {
        await createTestRuntime();
      }

      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      const page1 = await client.apiCall('/runtimes?limit=2&offset=0');
      expect(page1.results.length).toBeLessThanOrEqual(2);

      const page2 = await client.apiCall('/runtimes?limit=2&offset=2');
      expect(page2.results).toBeInstanceOf(Array);

      // Verify no overlap if both have results
      if (page1.results.length > 0 && page2.results.length > 0) {
        const page1Ids = page1.results.map((r: any) => r.id);
        const page2Ids = page2.results.map((r: any) => r.id);
        const intersection = page1Ids.filter((id: string) => page2Ids.includes(id));
        expect(intersection).toHaveLength(0);
      }
    });
  });

  describe('GET /api/runtimes/:id', () => {
    it('should get runtime by id', async () => {
      const runtime = await createTestRuntime({
        creationStatus: 'COMPLETED',
        creationLogs: 'Test logs',
      });

      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/runtimes/${runtime.id}`);

      expect(response).toMatchObject({
        id: runtime.id,
        config: expect.any(Object),
        configHash: runtime.configHash,
        creationStatus: 'COMPLETED',
        creationLogs: 'Test logs',
        createdAt: expect.any(String),
        isDefault: expect.any(Boolean),
      });
    });

    it('should return 404 for non-existent runtime', async () => {
      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      await expect(client.apiCall('/runtimes/non-existent-id')).rejects.toThrow(
        /not found/
      );
    });
  });

  describe('POST /api/runtimes', () => {
    it('should create runtime as admin', async () => {
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
          isAdmin: true,
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

      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const adminClient = new TokenApiClient('http://localhost:3000', plaintext);

      const response = await adminClient.apiCall('/runtimes', {
        method: 'POST',
        body: {
          config: {
            image_hash: 'sha256:test123',
          },
        },
      });

      expect(response).toMatchObject({
        id: expect.any(String),
        configHash: expect.any(String),
        creationStatus: expect.any(String),
        createdAt: expect.any(String),
      });
    });

    it('should reject non-admin users', async () => {
      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      await expect(
        client.apiCall('/runtimes', {
          method: 'POST',
          body: {
            config: {
              image_hash: 'sha256:test',
            },
          },
        })
      ).rejects.toThrow(/Admin access required/);
    });
  });
});

describe('SDK E2E - Workflow Deployments', () => {
  describe('GET /api/workflow-deployments', () => {
    it('should list workflow deployments', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id);
      const runtime = await createTestRuntime();

      await createTestWorkflowDeployment(workflow.id, runtime.id, null, {
        status: 'ACTIVE',
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflow-deployments?workflowId=${workflow.id}`);

      expect(response).toHaveProperty('results');
      expect(response.results.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter deployments by workflowId', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow1 = await createTestWorkflow(namespace.id);
      const workflow2 = await createTestWorkflow(namespace.id);
      const runtime = await createTestRuntime();

      const deployment1 = await createTestWorkflowDeployment(workflow1.id, runtime.id);
      await createTestWorkflowDeployment(workflow2.id, runtime.id);

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(
        `/workflow-deployments?workflowId=${workflow1.id}`
      );

      expect(response.results).toHaveLength(1);
      expect(response.results[0].workflowId).toBe(workflow1.id);
    });
  });

  describe('POST /api/workflow-deployments', () => {
    it('should create a workflow deployment', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id);
      const runtime = await createTestRuntime({ creationStatus: 'COMPLETED' });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/workflow-deployments', {
        method: 'POST',
        body: {
          workflowId: workflow.id,
          runtimeId: runtime.id,
          code: {
            files: {
              'main.ts': 'export default async function() { return "Hello"; }',
            },
            entrypoint: 'main.ts',
          },
        },
      });

      expect(response).toMatchObject({
        id: expect.any(String),
        workflowId: workflow.id,
        runtimeId: runtime.id,
        status: expect.any(String),
      });

      // Verify in database
      const { getTestDb } = await import('../../setup/global-setup');
      const { workflowDeployments } = await import('~/server/db/schema');
      const { eq } = await import('drizzle-orm');

      const [deployment] = await getTestDb()
        .select()
        .from(workflowDeployments)
        .where(eq(workflowDeployments.id, response.id));

      expect(deployment).toBeDefined();
      expect(deployment.workflowId).toBe(workflow.id);
    });

    it('should use default runtime if not specified', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id);

      // Ensure there's a default runtime
      const runtime = await createTestRuntime({ creationStatus: 'COMPLETED' });

      // Set it as the default runtime
      const { setDefaultRuntimeId } = await import('~/server/services/default-runtime');
      await setDefaultRuntimeId(runtime.id);

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/workflow-deployments', {
        method: 'POST',
        body: {
          workflowId: workflow.id,
          code: {
            files: {
              'index.ts': 'export default async () => "test";',
            },
            entrypoint: 'index.ts',
          },
        },
      });

      expect(response).toHaveProperty('runtimeId');
      expect(response.runtimeId).toBeDefined();
    });

    it('should deny access to workflows in other organizations', async () => {
      const org1 = await createTestOrganization();
      const org2 = await createTestOrganization();

      const namespace2 = await createTestNamespace({ organizationId: org2.id });
      const workflow2 = await createTestWorkflow(namespace2.id);
      const runtime = await createTestRuntime();

      const { client } = await setupSdkTest({ organizationId: org1.id });

      await expect(
        client.apiCall('/workflow-deployments', {
          method: 'POST',
          body: {
            workflowId: workflow2.id,
            runtimeId: runtime.id,
            code: {
              files: { 'main.ts': 'export default () => {};' },
              entrypoint: 'main.ts',
            },
          },
        })
      ).rejects.toThrow(/Access denied|not found/);
    });
  });

  describe('GET /api/workflow-deployments/:id', () => {
    it('should get deployment by id', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id);
      const runtime = await createTestRuntime();
      const deployment = await createTestWorkflowDeployment(workflow.id, runtime.id);

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflow-deployments/${deployment.id}`);

      expect(response).toMatchObject({
        id: deployment.id,
        workflowId: workflow.id,
        runtimeId: runtime.id,
        status: expect.any(String),
      });
    });

    it('should return 404 for non-existent deployment', async () => {
      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      await expect(
        client.apiCall('/workflow-deployments/non-existent-id')
      ).rejects.toThrow(/not found/);
    });
  });

  describe('PATCH /api/workflow-deployments/:id', () => {
    it('should update deployment status', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id);
      const runtime = await createTestRuntime();
      const deployment = await createTestWorkflowDeployment(workflow.id, runtime.id, null, {
        status: 'ACTIVE',
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflow-deployments/${deployment.id}`, {
        method: 'PATCH',
        body: {
          status: 'INACTIVE',
        },
      });

      expect(response.status).toBe('INACTIVE');

      // Verify in database
      const { getTestDb } = await import('../../setup/global-setup');
      const { workflowDeployments } = await import('~/server/db/schema');
      const { eq } = await import('drizzle-orm');

      const [updated] = await getTestDb()
        .select()
        .from(workflowDeployments)
        .where(eq(workflowDeployments.id, deployment.id));

      expect(updated.status).toBe('INACTIVE');
    });
  });

  describe('DELETE /api/workflow-deployments/:id', () => {
    it('should delete a deployment', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id);
      const runtime = await createTestRuntime();
      const deployment = await createTestWorkflowDeployment(workflow.id, runtime.id);

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflow-deployments/${deployment.id}`, {
        method: 'DELETE',
      });

      expect(response).toMatchObject({ success: true });

      // Verify deletion
      const { getTestDb } = await import('../../setup/global-setup');
      const { workflowDeployments } = await import('~/server/db/schema');
      const { eq } = await import('drizzle-orm');

      const [deleted] = await getTestDb()
        .select()
        .from(workflowDeployments)
        .where(eq(workflowDeployments.id, deployment.id));

      expect(deleted).toBeUndefined();
    });
  });
});
