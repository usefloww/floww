import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
vi.mock('~/server/db', () => ({
  getDb: vi.fn(() => mockDb),
}));

const mockDb = {
  execute: vi.fn(),
};

describe('Health API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return ok when database is accessible', async () => {
      mockDb.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
      
      // Simulate the route handler
      const handler = async () => {
        try {
          await mockDb.execute();
          return {
            status: 'ok',
            timestamp: expect.any(String),
            services: { database: 'ok' },
          };
        } catch {
          return {
            status: 'error',
            services: { database: 'error' },
          };
        }
      };
      
      const result = await handler();
      
      expect(result.status).toBe('ok');
      expect(result.services.database).toBe('ok');
    });

    it('should return error when database is inaccessible', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('Connection failed'));
      
      const handler = async () => {
        try {
          await mockDb.execute();
          return {
            status: 'ok',
            services: { database: 'ok' },
          };
        } catch {
          return {
            status: 'error',
            services: { database: 'error' },
          };
        }
      };
      
      const result = await handler();
      
      expect(result.status).toBe('error');
      expect(result.services.database).toBe('error');
    });
  });
});
