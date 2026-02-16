/**
 * Per-file test setup for Vitest
 *
 * This file sets up transaction-based test isolation:
 * - Each test runs in a transaction that is rolled back after the test
 * - This ensures tests don't interfere with each other
 *
 * Note: Migrations are handled by run-migrations.ts (globalSetup)
 */

import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config({ path: '.env' });

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '~/server/db/schema';

// Test database connection string - same postgres instance as dev, different db name
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://admin:secret@localhost:5432/floww_test';

// Global test database client and connection
let testClient: postgres.Sql;
let testDb: PostgresJsDatabase<typeof schema>;

/**
 * Get the test database instance.
 * This should be used by tests and factories.
 */
export function getTestDb(): PostgresJsDatabase<typeof schema> {
  if (!testDb) {
    throw new Error('Test database not initialized. Make sure tests are running through Vitest.');
  }
  return testDb;
}

// Per-file setup - runs once per test file
beforeAll(async () => {
  testClient = postgres(TEST_DATABASE_URL, { max: 1 });
  testDb = drizzle(testClient, { schema });
});

// Global teardown - runs once after all tests
afterAll(async () => {
  console.log('Cleaning up test database...');
  if (testClient) {
    await testClient.end();
  }
});

// Before each test - start a transaction
beforeEach(async () => {
  // Start a transaction
  await testClient.unsafe('BEGIN');
});

// After each test - rollback the transaction
afterEach(async () => {
  // Rollback transaction, undoing all changes made during the test
  await testClient.unsafe('ROLLBACK');
});

// Export for use in tests
export { testDb, testClient };
