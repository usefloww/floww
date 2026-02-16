import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Billing Service Tests
 * 
 * Tests the billing service functions with mocked database.
 */

// Create a chainable mock
function createChainableMock() {
  const mock: Record<string, unknown> = {};
  const chainMethods = ['select', 'from', 'where', 'innerJoin', 'leftJoin', 'insert', 'values', 'delete', 'update', 'set', 'returning', 'limit', 'onConflictDoUpdate'];
  
  chainMethods.forEach(method => {
    mock[method] = vi.fn().mockReturnValue(mock);
  });
  
  mock.execute = vi.fn().mockResolvedValue([]);
  
  return mock;
}

const mockDb = createChainableMock();

vi.mock('~/server/db', () => ({
  getDb: vi.fn(() => mockDb),
}));

// Mock Stripe service
vi.mock('~/server/services/stripe-service', () => ({
  getOrCreateCustomer: vi.fn(),
  createSubscriptionWithIntent: vi.fn(),
  cancelSubscription: vi.fn(),
}));

describe('BillingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(mockDb).forEach(key => {
      if (typeof mockDb[key] === 'function' && key !== 'execute') {
        (mockDb[key] as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);
      }
    });
  });

  describe('getSubscriptionDetails', () => {
    it('should return free tier details for a free subscription', async () => {
      const { getSubscriptionDetails } = await import('~/server/services/billing-service');
      
      const freeSubscription = {
        id: 'sub-1',
        organizationId: 'org-1',
        tier: 'FREE' as const,
        status: 'ACTIVE' as const,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        trialEndsAt: null,
        gracePeriodEndsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const result = getSubscriptionDetails(freeSubscription);
      
      expect(result.tier).toBe('FREE');
      expect(result.isPaid).toBe(false);
      expect(result.planName).toBe('Free');
    });

    it('should return paid tier details for an active hobby subscription', async () => {
      const { getSubscriptionDetails } = await import('~/server/services/billing-service');
      
      const hobbySubscription = {
        id: 'sub-1',
        organizationId: 'org-1',
        tier: 'HOBBY' as const,
        status: 'ACTIVE' as const,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        trialEndsAt: null,
        gracePeriodEndsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const result = getSubscriptionDetails(hobbySubscription);
      
      expect(result.tier).toBe('HOBBY');
      expect(result.isPaid).toBe(true);
      expect(result.planName).toBe('Hobby');
    });
  });

  describe('getOrCreateSubscription', () => {
    it('should return existing subscription if found', async () => {
      const mockSubscription = {
        id: 'sub-1',
        organizationId: 'org-1',
        tier: 'FREE',
        status: 'ACTIVE',
      };
      (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockSubscription]);
      
      const { getOrCreateSubscription } = await import('~/server/services/billing-service');
      const result = await getOrCreateSubscription('org-1');
      
      expect(result.id).toBe('sub-1');
    });

    it('should create new free subscription if not found', async () => {
      // No existing subscription
      (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      // Return the newly created subscription
      (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{
        id: 'sub-new',
        organizationId: 'org-1',
        tier: 'FREE',
        status: 'ACTIVE',
      }]);
      
      const { getOrCreateSubscription } = await import('~/server/services/billing-service');
      const result = await getOrCreateSubscription('org-1');
      
      expect(result.tier).toBe('FREE');
    });
  });

  describe('checkWorkflowLimit', () => {
    it('should return allowed when under limit', async () => {
      // Mock subscription lookup returns free tier
      (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ tier: 'FREE', status: 'ACTIVE' }]);
      // Mock workflow count - under free tier limit of 3
      (mockDb.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ count: '2' }]);
      
      const { checkWorkflowLimit } = await import('~/server/services/billing-service');
      const result = await checkWorkflowLimit('org-1');
      
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkExecutionLimit', () => {
    it('should return allowed when under monthly limit', async () => {
      // Mock subscription lookup
      (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ tier: 'FREE', status: 'ACTIVE' }]);
      // Mock execution count  
      (mockDb.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ count: '50' }]);
      
      const { checkExecutionLimit } = await import('~/server/services/billing-service');
      const result = await checkExecutionLimit('org-1');
      
      expect(result.allowed).toBe(true);
    });
  });
});
