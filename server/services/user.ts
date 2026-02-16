/**
 * User Service
 *
 * Handles user creation and lookup
 */

import { eq } from 'drizzle-orm';
import { getDb } from '~/server/db';
import { users, namespaces } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';

export interface UserInfo {
  id: string;
  workosUserId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  userType: 'HUMAN' | 'SERVICE_ACCOUNT';
  isAdmin: boolean;
  createdAt: Date;
}

/**
 * Get a user by their WorkOS user ID
 */
export async function getUserByWorkosId(workosUserId: string): Promise<UserInfo | null> {
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.workosUserId, workosUserId))
    .limit(1);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    workosUserId: user.workosUserId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    userType: user.userType,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

/**
 * Get or create a user by their WorkOS user ID
 */
export async function getOrCreateUser(params: {
  workosUserId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}): Promise<UserInfo> {
  const db = getDb();

  // Try to find existing user
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.workosUserId, params.workosUserId))
    .limit(1);

  if (existingUser) {
    // Update user info if it has changed
    const needsUpdate =
      (params.email && params.email !== existingUser.email) ||
      (params.firstName && params.firstName !== existingUser.firstName) ||
      (params.lastName && params.lastName !== existingUser.lastName) ||
      (params.username && params.username !== existingUser.username);

    if (needsUpdate) {
      const [updatedUser] = await db
        .update(users)
        .set({
          email: params.email ?? existingUser.email,
          firstName: params.firstName ?? existingUser.firstName,
          lastName: params.lastName ?? existingUser.lastName,
          username: params.username ?? existingUser.username,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      return {
        id: updatedUser.id,
        workosUserId: updatedUser.workosUserId,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        userType: updatedUser.userType,
        isAdmin: updatedUser.isAdmin,
        createdAt: updatedUser.createdAt,
      };
    }

    return {
      id: existingUser.id,
      workosUserId: existingUser.workosUserId,
      email: existingUser.email,
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      userType: existingUser.userType,
      isAdmin: existingUser.isAdmin,
      createdAt: existingUser.createdAt,
    };
  }

  // Create new user
  const userId = generateUlidUuid();

  const [newUser] = await db
    .insert(users)
    .values({
      id: userId,
      workosUserId: params.workosUserId,
      email: params.email ?? null,
      firstName: params.firstName ?? null,
      lastName: params.lastName ?? null,
      username: params.username ?? null,
      userType: 'HUMAN',
      isAdmin: false,
    })
    .returning();

  // Create personal namespace for the user
  const namespaceId = generateUlidUuid();
  await db.insert(namespaces).values({
    id: namespaceId,
    userOwnerId: userId,
    organizationOwnerId: null,
  });

  return {
    id: newUser.id,
    workosUserId: newUser.workosUserId,
    email: newUser.email,
    firstName: newUser.firstName,
    lastName: newUser.lastName,
    userType: newUser.userType,
    isAdmin: newUser.isAdmin,
    createdAt: newUser.createdAt,
  };
}
