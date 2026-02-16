/**
 * Database Mock for Tests
 *
 * This mocks ~/server/db to return the test database instance
 * instead of the production database. All mocking is confined
 * to test files - no changes to production code needed.
 *
 * IMPORTANT: This file must be in setupFiles AFTER global-setup.ts
 * in vitest.config.ts to ensure the test database is created first.
 *
 * How it works:
 * 1. Vitest hoists vi.mock() to the top of the module
 * 2. When any code imports from '~/server/db', it gets our mock
 * 3. Our mock returns the test database from getTestDb()
 * 4. All server code (auth, services, etc.) now uses test database
 * 5. Transaction isolation from global-setup.ts continues to work
 */

import { vi } from 'vitest';

// Mock MUST be at module top level for Vitest hoisting
vi.mock('~/server/db', async () => {
  // Dynamically import to avoid circular dependencies
  // This happens after global-setup.ts creates the test database
  const setup = await import('./global-setup');

  return {
    /**
     * Mocked getDb() - returns test database instead of production
     */
    getDb: () => {
      return setup.getTestDb();
    },

    /**
     * Mocked getClient() - returns underlying postgres client
     * Some code may use getClient() directly instead of getDb()
     */
    getClient: () => {
      const db = setup.getTestDb();
      // Drizzle stores the underlying client in the _ property
      return (db as any)._;
    },
  };
});
