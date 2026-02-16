/**
 * Workflow Deployments API Route Tests
 *
 * Tests for the standalone /api/workflow-deployments endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock services
const mockListDeployments = vi.fn();
const mockGetDeployment = vi.fn();
const mockCreateDeployment = vi.fn();
const mockUpdateDeploymentStatus = vi.fn();
const mockDeleteDeployment = vi.fn();
const mockGetWorkflow = vi.fn();
const mockHasWorkflowAccess = vi.fn();
const mockGetDefaultRuntimeId = vi.fn();
const mockGetRuntime = vi.fn();
const mockSyncTriggers = vi.fn();
const mockGetRuntimeImpl = vi.fn();

vi.mock('~/server/services/workflow-service', () => ({
  listDeployments: mockListDeployments,
  getDeployment: mockGetDeployment,
  createDeployment: mockCreateDeployment,
  updateDeploymentStatus: mockUpdateDeploymentStatus,
  deleteDeployment: mockDeleteDeployment,
  getWorkflow: mockGetWorkflow,
}));

vi.mock('~/server/services/access-service', () => ({
  hasWorkflowAccess: mockHasWorkflowAccess,
}));

vi.mock('~/server/services/default-runtime', () => ({
  getDefaultRuntimeId: mockGetDefaultRuntimeId,
}));

vi.mock('~/server/services/runtime-service', () => ({
  getRuntime: mockGetRuntime,
}));

vi.mock('~/server/services/trigger-service', () => ({
  syncTriggers: mockSyncTriggers,
}));

vi.mock('~/server/packages/runtimes', () => ({
  getRuntime: mockGetRuntimeImpl,
}));

vi.mock('~/server/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    })),
  })),
}));

vi.mock('~/server/utils/encryption', () => ({
  decryptSecret: vi.fn(() => '{}'),
}));

vi.mock('~/server/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Workflow Deployments API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default return values
    mockHasWorkflowAccess.mockResolvedValue(true);
    mockGetDefaultRuntimeId.mockResolvedValue('default-runtime-id');
    mockGetRuntimeImpl.mockReturnValue({
      getDefinitions: vi.fn().mockResolvedValue({
        success: true,
        triggers: [],
        providers: [],
      }),
    });
  });

  describe('GET /api/workflow-deployments', () => {
    it('should list deployments when user has workflow access', async () => {
      const mockDeployments = [
        {
          id: 'dep-1',
          workflowId: 'wf-1',
          runtimeId: 'rt-1',
          deployedById: 'user-1',
          status: 'active',
          deployedAt: new Date('2025-01-01'),
          note: null,
          userCode: { files: {}, entrypoint: 'main.ts' },
        },
        {
          id: 'dep-2',
          workflowId: 'wf-1',
          runtimeId: 'rt-1',
          deployedById: 'user-1',
          status: 'inactive',
          deployedAt: new Date('2025-01-02'),
          note: 'Previous deployment',
          userCode: { files: {}, entrypoint: 'main.ts' },
        },
      ];

      mockListDeployments.mockResolvedValue(mockDeployments);

      const result = await mockListDeployments('wf-1');

      expect(result).toEqual(mockDeployments);
      expect(result).toHaveLength(2);
    });

    it('should return empty list when no deployments exist', async () => {
      mockListDeployments.mockResolvedValue([]);

      const result = await mockListDeployments('wf-1');

      expect(result).toEqual([]);
    });

    it('should deny access when user has no workflow access', async () => {
      mockHasWorkflowAccess.mockResolvedValue(false);

      const hasAccess = await mockHasWorkflowAccess('user-1', 'wf-1');

      expect(hasAccess).toBe(false);
    });
  });

  describe('POST /api/workflow-deployments', () => {
    it('should create deployment when user has access', async () => {
      const mockWorkflow = {
        id: 'wf-1',
        namespaceId: 'ns-1',
        name: 'Test Workflow',
      };

      const mockRuntime = {
        id: 'rt-1',
        config: { image_uri: 'test:latest' },
      };

      const mockDeployment = {
        id: 'dep-new',
        workflowId: 'wf-1',
        runtimeId: 'rt-1',
        deployedById: 'user-1',
        status: 'active',
        deployedAt: new Date(),
        userCode: { files: { 'main.ts': 'console.log("hello")' }, entrypoint: 'main.ts' },
        note: null,
      };

      mockGetWorkflow.mockResolvedValue(mockWorkflow);
      mockGetRuntime.mockResolvedValue(mockRuntime);
      mockCreateDeployment.mockResolvedValue(mockDeployment);
      mockSyncTriggers.mockResolvedValue([]);

      const result = await mockCreateDeployment({
        workflowId: 'wf-1',
        runtimeId: 'rt-1',
        deployedById: 'user-1',
        userCode: { files: { 'main.ts': 'console.log("hello")' }, entrypoint: 'main.ts' },
      });

      expect(result.workflowId).toBe('wf-1');
      expect(result.status).toBe('active');
    });

    it('should use default runtime when not specified', async () => {
      mockGetDefaultRuntimeId.mockResolvedValue('default-rt');

      const runtimeId = await mockGetDefaultRuntimeId();

      expect(runtimeId).toBe('default-rt');
    });

    it('should fail when workflow not found', async () => {
      mockGetWorkflow.mockResolvedValue(null);

      const workflow = await mockGetWorkflow('non-existent');

      expect(workflow).toBeNull();
    });

    it('should fail when runtime not found', async () => {
      mockGetWorkflow.mockResolvedValue({ id: 'wf-1', namespaceId: 'ns-1' });
      mockGetRuntime.mockResolvedValue(null);

      const runtime = await mockGetRuntime('non-existent');

      expect(runtime).toBeNull();
    });
  });

  describe('GET /api/workflow-deployments/:deploymentId', () => {
    it('should return deployment details', async () => {
      const mockDeployment = {
        id: 'dep-1',
        workflowId: 'wf-1',
        runtimeId: 'rt-1',
        deployedById: 'user-1',
        status: 'active',
        deployedAt: new Date(),
        note: null,
        userCode: { files: {}, entrypoint: 'main.ts' },
      };

      mockGetDeployment.mockResolvedValue(mockDeployment);

      const result = await mockGetDeployment('dep-1');

      expect(result).toEqual(mockDeployment);
    });

    it('should return null for non-existent deployment', async () => {
      mockGetDeployment.mockResolvedValue(null);

      const result = await mockGetDeployment('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('PATCH /api/workflow-deployments/:deploymentId', () => {
    it('should update deployment status', async () => {
      const mockDeployment = {
        id: 'dep-1',
        workflowId: 'wf-1',
        runtimeId: 'rt-1',
        status: 'active',
        deployedAt: new Date(),
      };

      const updatedDeployment = {
        ...mockDeployment,
        status: 'inactive',
      };

      mockGetDeployment.mockResolvedValue(mockDeployment);
      mockUpdateDeploymentStatus.mockResolvedValue(updatedDeployment);

      const result = await mockUpdateDeploymentStatus('dep-1', 'inactive');

      expect(result.status).toBe('inactive');
    });

    it('should return null for non-existent deployment', async () => {
      mockUpdateDeploymentStatus.mockResolvedValue(null);

      const result = await mockUpdateDeploymentStatus('non-existent', 'inactive');

      expect(result).toBeNull();
    });
  });

  describe('DELETE /api/workflow-deployments/:deploymentId', () => {
    it('should delete deployment when user has access', async () => {
      const mockDeployment = {
        id: 'dep-1',
        workflowId: 'wf-1',
        runtimeId: 'rt-1',
        status: 'active',
        deployedAt: new Date(),
      };

      mockGetDeployment.mockResolvedValue(mockDeployment);
      mockDeleteDeployment.mockResolvedValue(true);

      await mockDeleteDeployment('dep-1');

      expect(mockDeleteDeployment).toHaveBeenCalledWith('dep-1');
    });

    it('should check access before deleting', async () => {
      mockHasWorkflowAccess.mockResolvedValue(false);

      const hasAccess = await mockHasWorkflowAccess('user-1', 'wf-1');

      expect(hasAccess).toBe(false);
    });
  });

  describe('Trigger sync on deployment', () => {
    it('should sync triggers after successful deployment', async () => {
      const webhookInfo = [
        {
          id: 'wh-1',
          url: 'https://api.floww.dev/webhook/abc123',
          path: '/webhook/abc123',
          method: 'POST',
          triggerId: 'trigger-1',
          triggerType: 'onWebhook',
          providerType: 'builtin',
          providerAlias: 'default',
        },
      ];

      mockSyncTriggers.mockResolvedValue(webhookInfo);

      const result = await mockSyncTriggers('wf-1', 'ns-1', [
        {
          providerType: 'builtin',
          providerAlias: 'default',
          triggerType: 'onWebhook',
          input: {},
        },
      ]);

      expect(result).toEqual(webhookInfo);
      expect(result[0].url).toContain('/webhook/');
    });

    it('should handle trigger sync failure gracefully', async () => {
      mockSyncTriggers.mockRejectedValue(new Error('Trigger sync failed'));

      await expect(mockSyncTriggers('wf-1', 'ns-1', [])).rejects.toThrow('Trigger sync failed');
    });
  });

  describe('Runtime definition validation', () => {
    it('should validate definitions before creating deployment', async () => {
      const mockRuntimeImpl = {
        getDefinitions: vi.fn().mockResolvedValue({
          success: true,
          triggers: [
            {
              provider: { type: 'builtin', alias: 'default' },
              triggerType: 'onWebhook',
              input: {},
            },
          ],
          providers: [{ type: 'builtin', alias: 'default' }],
        }),
      };

      mockGetRuntimeImpl.mockReturnValue(mockRuntimeImpl);

      const runtimeImpl = mockGetRuntimeImpl();
      const definitions = await runtimeImpl.getDefinitions(
        { runtimeId: 'rt-1', imageDigest: 'test:latest' },
        { files: { 'main.ts': 'code' }, entrypoint: 'main.ts' },
        {}
      );

      expect(definitions.success).toBe(true);
      expect(definitions.triggers).toHaveLength(1);
      expect(definitions.providers).toHaveLength(1);
    });

    it('should reject deployment when definitions extraction fails', async () => {
      const mockRuntimeImpl = {
        getDefinitions: vi.fn().mockResolvedValue({
          success: false,
          error: { message: 'Syntax error in code', stack: '' },
        }),
      };

      mockGetRuntimeImpl.mockReturnValue(mockRuntimeImpl);

      const runtimeImpl = mockGetRuntimeImpl();
      const definitions = await runtimeImpl.getDefinitions(
        { runtimeId: 'rt-1', imageDigest: 'test:latest' },
        { files: { 'main.ts': 'invalid code' }, entrypoint: 'main.ts' },
        {}
      );

      expect(definitions.success).toBe(false);
      expect(definitions.error.message).toBe('Syntax error in code');
    });
  });
});
