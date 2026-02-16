/**
 * SDK E2E Tests - Workflows
 *
 * Tests SDK workflow operations via Dashboard API routes.
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
} from '../../helpers/factories';

beforeAll(() => {
  setupSdkTestEnvironment();
});

afterAll(() => {
  teardownSdkTestEnvironment();
  teardownSdkTest();
});

describe('SDK E2E - Workflows', () => {
  describe('GET /api/workflows', () => {
    it('should list workflows in a namespace', async () => {
      // Setup organization and namespace
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });

      // Create test workflows
      const workflow1 = await createTestWorkflow(namespace.id, null, {
        name: 'Test Workflow 1',
        description: 'First test workflow',
      });
      const workflow2 = await createTestWorkflow(namespace.id, null, {
        name: 'Test Workflow 2',
        description: 'Second test workflow',
      });

      // Setup SDK
      const { client } = await setupSdkTest({ organizationId: org.id });

      // List workflows
      const response = await client.apiCall(`/workflows?namespaceId=${namespace.id}`);

      // Verify response
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('total');
      expect(response.results).toHaveLength(2);
      expect(response.total).toBe(2);

      // Verify workflow data
      const workflowIds = response.results.map((w: any) => w.id);
      expect(workflowIds).toContain(workflow1.id);
      expect(workflowIds).toContain(workflow2.id);

      // Verify workflow structure
      expect(response.results[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        namespaceId: namespace.id,
        active: expect.any(Boolean),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should return empty list for namespace with no workflows', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflows?namespaceId=${namespace.id}`);

      expect(response.results).toHaveLength(0);
      expect(response.total).toBe(0);
    });

    it('should support pagination', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });

      // Create 5 workflows
      for (let i = 0; i < 5; i++) {
        await createTestWorkflow(namespace.id, null, {
          name: `Workflow ${i}`,
        });
      }

      const { client } = await setupSdkTest({ organizationId: org.id });

      // Get first page (limit 2)
      const page1 = await client.apiCall(
        `/workflows?namespaceId=${namespace.id}&limit=2&offset=0`
      );
      expect(page1.results).toHaveLength(2);
      expect(page1.total).toBe(5);

      // Get second page
      const page2 = await client.apiCall(
        `/workflows?namespaceId=${namespace.id}&limit=2&offset=2`
      );
      expect(page2.results).toHaveLength(2);
      expect(page2.total).toBe(5);

      // Verify no overlap
      const page1Ids = page1.results.map((w: any) => w.id);
      const page2Ids = page2.results.map((w: any) => w.id);
      const intersection = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('should only return workflows user has access to', async () => {
      // Create two organizations
      const org1 = await createTestOrganization();
      const org2 = await createTestOrganization();

      const namespace1 = await createTestNamespace({ organizationId: org1.id });
      const namespace2 = await createTestNamespace({ organizationId: org2.id });

      // Create workflows in both namespaces
      await createTestWorkflow(namespace1.id, null, { name: 'Org 1 Workflow' });
      await createTestWorkflow(namespace2.id, null, { name: 'Org 2 Workflow' });

      // Service account only in org1
      const { client } = await setupSdkTest({ organizationId: org1.id });

      // Should see org1 workflows
      const org1Response = await client.apiCall(`/workflows?namespaceId=${namespace1.id}`);
      expect(org1Response.results).toHaveLength(1);

      // Should not see org2 workflows (will return empty because access check fails)
      const org2Response = await client.apiCall(`/workflows?namespaceId=${namespace2.id}`);
      expect(org2Response.results).toHaveLength(0);
    });
  });

  describe('POST /api/workflows', () => {
    it('should create a new workflow', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall('/workflows', {
        method: 'POST',
        body: {
          namespaceId: namespace.id,
          name: 'New Test Workflow',
          description: 'Created via SDK',
        },
      });

      expect(response).toMatchObject({
        id: expect.any(String),
        name: 'New Test Workflow',
        description: 'Created via SDK',
        namespaceId: namespace.id,
        active: true,
        createdAt: expect.any(String),
      });

      // Verify it was actually created in the database
      const { getTestDb } = await import('../../setup/global-setup');
      const { workflows } = await import('~/server/db/schema');
      const { eq } = await import('drizzle-orm');

      const [workflow] = await getTestDb()
        .select()
        .from(workflows)
        .where(eq(workflows.id, response.id));

      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('New Test Workflow');
    });

    it('should reject duplicate workflow names in same namespace', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      await createTestWorkflow(namespace.id, null, { name: 'Duplicate Name' });

      const { client } = await setupSdkTest({ organizationId: org.id });

      await expect(
        client.apiCall('/workflows', {
          method: 'POST',
          body: {
            namespaceId: namespace.id,
            name: 'Duplicate Name',
            description: 'Should fail',
          },
        })
      ).rejects.toThrow(/already exists/);
    });

    it('should allow same workflow name in different namespaces', async () => {
      const org = await createTestOrganization();
      const namespace1 = await createTestNamespace({ organizationId: org.id });
      const namespace2 = await createTestNamespace({ organizationId: org.id });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const workflow1 = await client.apiCall('/workflows', {
        method: 'POST',
        body: {
          namespaceId: namespace1.id,
          name: 'Same Name',
          description: 'In namespace 1',
        },
      });

      const workflow2 = await client.apiCall('/workflows', {
        method: 'POST',
        body: {
          namespaceId: namespace2.id,
          name: 'Same Name',
          description: 'In namespace 2',
        },
      });

      expect(workflow1.id).not.toBe(workflow2.id);
      expect(workflow1.name).toBe(workflow2.name);
    });

    it('should require authentication', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });

      const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
      const client = new TokenApiClient('http://localhost:3000', 'invalid-token');

      await expect(
        client.apiCall('/workflows', {
          method: 'POST',
          body: {
            namespaceId: namespace.id,
            name: 'Should Fail',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('GET /api/workflows/:id', () => {
    it('should get workflow by id', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id, null, {
        name: 'Get Me',
        description: 'Test description',
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflows/${workflow.id}`);

      expect(response).toMatchObject({
        id: workflow.id,
        name: 'Get Me',
        description: 'Test description',
        namespaceId: namespace.id,
        active: true,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should return 404 for non-existent workflow', async () => {
      const org = await createTestOrganization();
      const { client } = await setupSdkTest({ organizationId: org.id });

      await expect(client.apiCall('/workflows/non-existent-id')).rejects.toThrow(
        /not found/
      );
    });

    it('should deny access to workflows in other organizations', async () => {
      const org1 = await createTestOrganization();
      const org2 = await createTestOrganization();

      const namespace2 = await createTestNamespace({ organizationId: org2.id });
      const workflow2 = await createTestWorkflow(namespace2.id, null, {
        name: 'Private Workflow',
      });

      // Service account only in org1
      const { client } = await setupSdkTest({ organizationId: org1.id });

      await expect(client.apiCall(`/workflows/${workflow2.id}`)).rejects.toThrow(
        /Access denied|not found/
      );
    });
  });

  describe('PATCH /api/workflows/:id', () => {
    it('should update workflow name and description', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id, null, {
        name: 'Original Name',
        description: 'Original description',
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflows/${workflow.id}`, {
        method: 'PATCH',
        body: {
          name: 'Updated Name',
          description: 'Updated description',
        },
      });

      expect(response).toMatchObject({
        id: workflow.id,
        name: 'Updated Name',
        description: 'Updated description',
      });

      // Verify in database
      const { getTestDb } = await import('../../setup/global-setup');
      const { workflows } = await import('~/server/db/schema');
      const { eq } = await import('drizzle-orm');

      const [updated] = await getTestDb()
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflow.id));

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');
    });

    it('should update active status', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id, null, {
        active: true,
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflows/${workflow.id}`, {
        method: 'PATCH',
        body: {
          active: false,
        },
      });

      expect(response.active).toBe(false);
    });

    it('should deny access to workflows in other organizations', async () => {
      const org1 = await createTestOrganization();
      const org2 = await createTestOrganization();

      const namespace2 = await createTestNamespace({ organizationId: org2.id });
      const workflow2 = await createTestWorkflow(namespace2.id, null, {
        name: 'Private Workflow',
      });

      const { client } = await setupSdkTest({ organizationId: org1.id });

      await expect(
        client.apiCall(`/workflows/${workflow2.id}`, {
          method: 'PATCH',
          body: { name: 'Hacked' },
        })
      ).rejects.toThrow(/Access denied|not found/);
    });
  });

  describe('DELETE /api/workflows/:id', () => {
    it('should delete a workflow', async () => {
      const org = await createTestOrganization();
      const namespace = await createTestNamespace({ organizationId: org.id });
      const workflow = await createTestWorkflow(namespace.id, null, {
        name: 'To Be Deleted',
      });

      const { client } = await setupSdkTest({ organizationId: org.id });

      const response = await client.apiCall(`/workflows/${workflow.id}`, {
        method: 'DELETE',
      });

      expect(response).toMatchObject({ success: true });

      // Verify it's deleted
      const { getTestDb } = await import('../../setup/global-setup');
      const { workflows } = await import('~/server/db/schema');
      const { eq } = await import('drizzle-orm');

      const [deleted] = await getTestDb()
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflow.id));

      expect(deleted).toBeUndefined();
    });

    it('should deny access to delete workflows in other organizations', async () => {
      const org1 = await createTestOrganization();
      const org2 = await createTestOrganization();

      const namespace2 = await createTestNamespace({ organizationId: org2.id });
      const workflow2 = await createTestWorkflow(namespace2.id, null);

      const { client } = await setupSdkTest({ organizationId: org1.id });

      await expect(
        client.apiCall(`/workflows/${workflow2.id}`, {
          method: 'DELETE',
        })
      ).rejects.toThrow(/Access denied|not found/);
    });
  });
});
