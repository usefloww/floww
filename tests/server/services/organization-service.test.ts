import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Organization Service Tests
 */

// Create a chainable mock that properly terminates chains
function createChainableMock() {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainMethods = ['select', 'from', 'where', 'innerJoin', 'leftJoin', 'insert', 'values', 'delete', 'update', 'set', 'returning', 'limit', 'onConflictDoUpdate', 'orderBy'];
  
  chainMethods.forEach(method => {
    mock[method] = vi.fn(() => mock);
  });
  
  mock.execute = vi.fn().mockResolvedValue([]);
  
  return mock;
}

const mockDb = createChainableMock();

vi.mock('~/server/db', () => ({
  getDb: vi.fn(() => mockDb),
}));

describe('OrganizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    
    // Reset all mock functions to return the mock object (for chaining)
    const chainMethods = ['select', 'from', 'where', 'innerJoin', 'leftJoin', 'insert', 'values', 'delete', 'update', 'set', 'returning', 'onConflictDoUpdate', 'orderBy'];
    chainMethods.forEach(method => {
      mockDb[method].mockReturnValue(mockDb);
    });
    // Reset execute to return empty array by default
    mockDb.execute.mockResolvedValue([]);
  });

  describe('getOrganization', () => {
    it('should return organization when found', async () => {
      const mockOrg = { id: 'org-1', displayName: 'Test Org' };
      mockDb.limit.mockResolvedValueOnce([mockOrg]);
      
      const { getOrganization } = await import('~/server/services/organization-service');
      const result = await getOrganization('org-1');
      
      expect(result).toEqual(mockOrg);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      
      const { getOrganization } = await import('~/server/services/organization-service');
      const result = await getOrganization('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('createOrganization', () => {
    it('should create organization and return result', async () => {
      const mockOrg = { id: 'org-1', displayName: 'Test Org' };
      const mockNs = { id: 'ns-1' };
      
      // First returning call is for org insert, second for namespace
      mockDb.returning
        .mockResolvedValueOnce([mockOrg])
        .mockResolvedValueOnce([mockNs]);
      
      const { createOrganization } = await import('~/server/services/organization-service');
      const result = await createOrganization('Test Org');
      
      expect(result.organization.displayName).toBe('Test Org');
    });
  });

  describe('membership functions', () => {
    it('isMember should return true when user is member', async () => {
      mockDb.limit.mockResolvedValueOnce([{ userId: 'user-1', role: 'MEMBER' }]);
      
      const { isMember } = await import('~/server/services/organization-service');
      const result = await isMember('user-1', 'org-1');
      
      expect(result).toBe(true);
    });

    it('isMember should return false when user is not member', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      
      const { isMember } = await import('~/server/services/organization-service');
      const result = await isMember('user-1', 'org-1');
      
      expect(result).toBe(false);
    });

    it('isAdmin should return true when user has admin role', async () => {
      mockDb.limit.mockResolvedValueOnce([{ role: 'ADMIN' }]);
      
      const { isAdmin } = await import('~/server/services/organization-service');
      const result = await isAdmin('user-1', 'org-1');
      
      expect(result).toBe(true);
    });

    it('isOwner should return true when user has owner role', async () => {
      mockDb.limit.mockResolvedValueOnce([{ role: 'OWNER' }]);
      
      const { isOwner } = await import('~/server/services/organization-service');
      const result = await isOwner('user-1', 'org-1');
      
      expect(result).toBe(true);
    });
  });
});
