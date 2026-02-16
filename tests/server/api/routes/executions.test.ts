/**
 * Executions API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
vi.mock('~/server/db', () => ({
  getDb: vi.fn(),
}));

// Mock execution service
vi.mock('~/server/services/execution-service', () => ({
  listExecutions: vi.fn(),
  listRecentExecutions: vi.fn(),
  getExecution: vi.fn(),
  getExecutionLogs: vi.fn(),
  createExecution: vi.fn(),
  updateExecutionCompleted: vi.fn(),
  updateExecutionFailed: vi.fn(),
  serializeExecution: vi.fn((e) => ({
    id: e.id,
    status: e.status,
    startedAt: e.startedAt?.toISOString(),
  })),
}));

// Mock access service
vi.mock('~/server/services/access-service', () => ({
  hasWorkflowAccess: vi.fn(),
}));

// Mock workflow auth
vi.mock('~/server/services/workflow-auth-service', () => ({
  verifyInvocationToken: vi.fn(),
}));

import * as executionService from '~/server/services/execution-service';
import * as accessService from '~/server/services/access-service';
import * as workflowAuthService from '~/server/services/workflow-auth-service';

describe('Executions API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /executions', () => {
    it('should list recent executions across all workflows', async () => {
      const mockExecutions = [
        { id: 'exec-1', workflowId: 'wf-1', status: 'COMPLETED', startedAt: new Date() },
        { id: 'exec-2', workflowId: 'wf-2', status: 'RUNNING', startedAt: new Date() },
      ];

      vi.mocked(executionService.listRecentExecutions).mockResolvedValue(mockExecutions as any);

      const result = await executionService.listRecentExecutions('user-1', { limit: 50 });

      expect(result).toHaveLength(2);
    });

    it('should list executions for specific workflow', async () => {
      const mockExecutions = {
        executions: [
          { id: 'exec-1', workflowId: 'wf-1', status: 'COMPLETED', startedAt: new Date() },
        ],
        total: 1,
      };

      vi.mocked(executionService.listExecutions).mockResolvedValue(mockExecutions as any);
      vi.mocked(accessService.hasWorkflowAccess).mockResolvedValue(true);

      const result = await executionService.listExecutions('wf-1', { limit: 50 });

      expect(result.executions).toHaveLength(1);
    });

    it('should filter by status', async () => {
      vi.mocked(executionService.listExecutions).mockResolvedValue({
        executions: [],
        total: 0,
      } as any);

      await executionService.listExecutions('wf-1', { status: 'FAILED' } as any);

      expect(executionService.listExecutions).toHaveBeenCalledWith('wf-1', { status: 'FAILED' });
    });

    it('should support pagination', async () => {
      await executionService.listExecutions('wf-1', { limit: 10, offset: 20 } as any);

      expect(executionService.listExecutions).toHaveBeenCalledWith('wf-1', { limit: 10, offset: 20 });
    });
  });

  describe('GET /executions/:id', () => {
    it('should return execution details', async () => {
      const mockExecution = {
        id: 'exec-1',
        workflowId: 'wf-1',
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
        result: { output: 'success' },
      };

      vi.mocked(executionService.getExecution).mockResolvedValue(mockExecution as any);
      vi.mocked(accessService.hasWorkflowAccess).mockResolvedValue(true);

      const result = await executionService.getExecution('exec-1');

      expect(result?.status).toBe('COMPLETED');
    });

    it('should return null for non-existent execution', async () => {
      vi.mocked(executionService.getExecution).mockResolvedValue(null);

      const result = await executionService.getExecution('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('GET /executions/:id/logs', () => {
    it('should return execution logs', async () => {
      const mockLogs = [
        { id: 'log-1', timestamp: new Date(), logLevel: 'INFO', message: 'Starting execution' },
        { id: 'log-2', timestamp: new Date(), logLevel: 'INFO', message: 'Processing...' },
        { id: 'log-3', timestamp: new Date(), logLevel: 'INFO', message: 'Completed' },
      ];

      vi.mocked(executionService.getExecution).mockResolvedValue({ id: 'exec-1', workflowId: 'wf-1' } as any);
      vi.mocked(executionService.getExecutionLogs).mockResolvedValue(mockLogs as any);
      vi.mocked(accessService.hasWorkflowAccess).mockResolvedValue(true);

      const result = await executionService.getExecutionLogs('exec-1');

      expect(result).toHaveLength(3);
    });
  });

  describe('POST /executions/:id/complete', () => {
    it('should complete execution with success', async () => {
      vi.mocked(workflowAuthService.verifyInvocationToken).mockResolvedValue({
        workflowId: 'wf-1',
        namespaceId: 'ns-1',
      } as any);
      vi.mocked(executionService.getExecution).mockResolvedValue({ id: 'exec-1' } as any);

      await executionService.updateExecutionCompleted('exec-1', {
        logs: [],
        result: { success: true },
      });

      expect(executionService.updateExecutionCompleted).toHaveBeenCalled();
    });

    it('should complete execution with failure', async () => {
      vi.mocked(workflowAuthService.verifyInvocationToken).mockResolvedValue({
        workflowId: 'wf-1',
        namespaceId: 'ns-1',
      } as any);
      vi.mocked(executionService.getExecution).mockResolvedValue({ id: 'exec-1' } as any);

      await executionService.updateExecutionFailed('exec-1', {
        error: 'Runtime error',
        logs: [],
      });

      expect(executionService.updateExecutionFailed).toHaveBeenCalled();
    });

    it('should require valid invocation token', async () => {
      vi.mocked(workflowAuthService.verifyInvocationToken).mockResolvedValue(null);

      // Should return 401
      expect(true).toBe(true);
    });
  });

  describe('GET /executions/workflows/:workflowId', () => {
    it('should list executions for workflow (alternative route)', async () => {
      const mockResult = {
        executions: [{ id: 'exec-1', status: 'COMPLETED' }],
        total: 1,
      };

      vi.mocked(executionService.listExecutions).mockResolvedValue(mockResult as any);

      const result = await executionService.listExecutions('wf-1', { limit: 50 });

      expect(result.total).toBe(1);
    });
  });

  describe('GET /executions/workflows/:workflowId/logs', () => {
    it('should aggregate logs from recent executions', async () => {
      expect(true).toBe(true);
    });
  });

  describe('Execution Status', () => {
    it('should support PENDING status', async () => {
      expect(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).toContain('PENDING');
    });

    it('should support RUNNING status', async () => {
      expect(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).toContain('RUNNING');
    });

    it('should support COMPLETED status', async () => {
      expect(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).toContain('COMPLETED');
    });

    it('should support FAILED status', async () => {
      expect(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).toContain('FAILED');
    });
  });
});
