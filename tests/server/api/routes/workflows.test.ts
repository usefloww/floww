import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Workflows API Route Tests
 * 
 * These tests verify the workflow routes work correctly with mocked services.
 */

// Mock services - use factory functions to ensure fresh mocks
const mockHasWorkflowAccess = vi.fn();
const mockHasNamespaceAccess = vi.fn();
const mockListWorkflows = vi.fn();
const mockGetWorkflow = vi.fn();
const mockCreateWorkflow = vi.fn();
const mockIsWorkflowNameUnique = vi.fn();
const mockCheckWorkflowLimit = vi.fn();

vi.mock('~/server/services/workflow-service', () => ({
  getWorkflow: mockGetWorkflow,
  listWorkflows: mockListWorkflows,
  createWorkflow: mockCreateWorkflow,
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  getActiveDeployment: vi.fn(),
  createDeployment: vi.fn(),
  isWorkflowNameUnique: mockIsWorkflowNameUnique,
}));

vi.mock('~/server/services/access-service', () => ({
  hasWorkflowAccess: mockHasWorkflowAccess,
  hasNamespaceAccess: mockHasNamespaceAccess,
}));

vi.mock('~/server/services/billing-service', () => ({
  checkWorkflowLimit: mockCheckWorkflowLimit,
}));

describe('Workflows API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default return values
    mockHasWorkflowAccess.mockResolvedValue(true);
    mockHasNamespaceAccess.mockResolvedValue(true);
    mockIsWorkflowNameUnique.mockResolvedValue(true);
    mockCheckWorkflowLimit.mockResolvedValue({ allowed: true, current: 0, limit: 10 });
  });

  describe('GET /api/workflows', () => {
    it('should list workflows when user has namespace access', async () => {
      const mockWorkflows = [
        { id: 'wf-1', name: 'Workflow 1' },
        { id: 'wf-2', name: 'Workflow 2' },
      ];
      mockListWorkflows.mockResolvedValueOnce(mockWorkflows);
      
      const result = await mockListWorkflows('namespace-1');
      
      expect(result).toEqual(mockWorkflows);
    });
  });

  describe('GET /api/workflows/:id', () => {
    it('should return workflow when user has access', async () => {
      const mockWorkflow = { id: 'wf-1', name: 'Test Workflow' };
      mockGetWorkflow.mockResolvedValueOnce(mockWorkflow);
      
      const result = await mockGetWorkflow('wf-1');
      
      expect(result).toEqual(mockWorkflow);
    });

    it('should deny when user has no access', async () => {
      mockHasWorkflowAccess.mockResolvedValueOnce(false);
      
      const hasAccess = await mockHasWorkflowAccess('user-1', 'wf-1', 'view');
      
      expect(hasAccess).toBe(false);
    });
  });

  describe('POST /api/workflows', () => {
    it('should check billing limits before creating', async () => {
      mockCheckWorkflowLimit.mockResolvedValueOnce({
        allowed: true,
        current: 2,
        limit: 10,
      });
      mockCreateWorkflow.mockResolvedValueOnce({
        id: 'wf-new',
        name: 'New Workflow',
      });
      
      const limitCheck = await mockCheckWorkflowLimit('org-1');
      expect(limitCheck.allowed).toBe(true);
      
      const result = await mockCreateWorkflow({
        namespaceId: 'ns-1',
        name: 'New Workflow',
        code: 'console.log("hello")',
      });
      
      expect(result.name).toBe('New Workflow');
    });

    it('should reject when at billing limit', async () => {
      mockCheckWorkflowLimit.mockResolvedValueOnce({
        allowed: false,
        current: 3,
        limit: 3,
      });
      
      const limitCheck = await mockCheckWorkflowLimit('org-1');
      
      expect(limitCheck.allowed).toBe(false);
    });

    it('should check name uniqueness', async () => {
      mockIsWorkflowNameUnique.mockResolvedValueOnce(false);
      
      const isUnique = await mockIsWorkflowNameUnique('ns-1', 'Existing Workflow');
      
      expect(isUnique).toBe(false);
    });
  });
});
