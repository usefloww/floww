/**
 * Transaction Isolation Tests
 *
 * These tests verify that each test runs in isolation:
 * - Data created in one test should not be visible in another test
 * - This is achieved through savepoint-based rollback
 */

import { describe, it, expect } from 'vitest';
import { getTestDb } from '../setup/global-setup';
import { users } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import { createTestUser } from '../helpers/factories';

describe('Transaction Isolation', () => {
  // We use a specific email to test isolation
  const isolationTestEmail = 'isolation-test@example.com';

  it('test 1: creates a user with specific email', async () => {
    const user = await createTestUser({ email: isolationTestEmail });

    expect(user.email).toBe(isolationTestEmail);

    const db = getTestDb();
    const allUsers = await db.select().from(users);

    // Should have at least one user (the one we just created)
    expect(allUsers.length).toBeGreaterThan(0);
  });

  it('test 2: should not see user from test 1', async () => {
    const db = getTestDb();

    // Look for the user created in test 1
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, isolationTestEmail));

    // Should NOT find the user because test 1's changes were rolled back
    expect(existingUser).toBeUndefined();
  });

  it('test 3: can create same email again (proving isolation)', async () => {
    // This would fail if test 1's data wasn't rolled back
    // because email uniqueness constraint would be violated
    const user = await createTestUser({ email: isolationTestEmail });

    expect(user.email).toBe(isolationTestEmail);
  });
});

describe('Multiple Users in Same Test', () => {
  it('should be able to create multiple users in one test', async () => {
    const db = getTestDb();

    const user1 = await createTestUser({ email: 'user1@example.com' });
    const user2 = await createTestUser({ email: 'user2@example.com' });
    const user3 = await createTestUser({ email: 'user3@example.com' });

    const allUsers = await db.select().from(users);

    // Should have exactly 3 users we created
    expect(allUsers.length).toBe(3);
    expect(allUsers.map((u) => u.email).sort()).toEqual([
      'user1@example.com',
      'user2@example.com',
      'user3@example.com',
    ]);
  });

  it('should not see users from previous test', async () => {
    const db = getTestDb();
    const allUsers = await db.select().from(users);

    // Should be empty - previous test's users were rolled back
    expect(allUsers.length).toBe(0);
  });
});
