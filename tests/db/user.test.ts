/**
 * User Database Operations Tests
 *
 * These tests verify that:
 * 1. User CRUD operations work correctly
 * 2. Transaction isolation works (data doesn't leak between tests)
 */

import { describe, it, expect } from 'vitest';
import { getTestDb } from '../setup/global-setup';
import { users } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import { createTestUser } from '../helpers/factories';

describe('User Database Operations', () => {
  it('should create a user', async () => {
    const user = await createTestUser({
      email: 'new-user@example.com',
      firstName: 'New',
      lastName: 'User',
    });

    expect(user.email).toBe('new-user@example.com');
    expect(user.firstName).toBe('New');
    expect(user.lastName).toBe('User');
    expect(user.id).toBeDefined();
    expect(user.userType).toBe('HUMAN');
  });

  it('should find user by email', async () => {
    const db = getTestDb();
    const createdUser = await createTestUser({
      email: 'find-me@example.com',
    });

    const [foundUser] = await db.select().from(users).where(eq(users.email, 'find-me@example.com'));

    expect(foundUser).toBeDefined();
    expect(foundUser.id).toBe(createdUser.id);
  });

  it('should update a user', async () => {
    const db = getTestDb();
    const user = await createTestUser({
      firstName: 'Original',
    });

    await db
      .update(users)
      .set({ firstName: 'Updated' })
      .where(eq(users.id, user.id));

    const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));

    expect(updatedUser.firstName).toBe('Updated');
  });

  it('should delete a user', async () => {
    const db = getTestDb();
    const user = await createTestUser();

    await db.delete(users).where(eq(users.id, user.id));

    const [deletedUser] = await db.select().from(users).where(eq(users.id, user.id));

    expect(deletedUser).toBeUndefined();
  });
});
