/**
 * Refresh Token Service
 *
 * Handles refresh token creation, validation, and revocation
 * for long-lived authentication sessions (primarily CLI and API access).
 */

import crypto from 'crypto';
import { eq, and, isNull, lt } from 'drizzle-orm';
import { getDb } from '~/server/db';
import { refreshTokens } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { logger } from '~/server/utils/logger';

// Refresh token configuration
const REFRESH_TOKEN_LENGTH = 48; // bytes, results in 64-char URL-safe string

/**
 * Hash a refresh token using SHA-256
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure, random refresh token
 */
function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_LENGTH).toString('base64url');
}

/**
 * Create a new refresh token for a user
 */
export async function createRefreshToken(
  userId: string,
  deviceName?: string
): Promise<string> {
  const db = getDb();

  // Generate plaintext token
  const plaintextToken = generateRefreshToken();

  // Hash the token for storage
  const tokenHash = hashToken(plaintextToken);

  // Create refresh token record
  await db.insert(refreshTokens).values({
    id: generateUlidUuid(),
    userId,
    tokenHash,
    deviceName: deviceName ?? null,
  });

  logger.info('Created refresh token', { userId, deviceName });

  // Return plaintext token to caller
  return plaintextToken;
}

/**
 * Validate a refresh token and update its last_used_at timestamp
 */
export async function validateAndUpdateRefreshToken(
  refreshToken: string
): Promise<string | null> {
  const db = getDb();

  // Hash the incoming token
  const tokenHash = hashToken(refreshToken);

  // Look up token in database
  const [tokenRecord] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRecord) {
    logger.warn('Refresh token not found');
    return null;
  }

  // Check if token is revoked
  if (tokenRecord.revokedAt !== null) {
    logger.warn('Refresh token is revoked', {
      tokenId: tokenRecord.id,
      revokedAt: tokenRecord.revokedAt.toISOString(),
    });
    return null;
  }

  // Update last_used_at timestamp
  await db
    .update(refreshTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(refreshTokens.id, tokenRecord.id));

  logger.debug('Refresh token validated', { userId: tokenRecord.userId, tokenId: tokenRecord.id });

  return tokenRecord.userId;
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  const db = getDb();

  // Hash the incoming token
  const tokenHash = hashToken(refreshToken);

  // Look up token in database
  const [tokenRecord] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRecord) {
    logger.warn('Refresh token not found for revocation');
    return false;
  }

  // Check if already revoked
  if (tokenRecord.revokedAt !== null) {
    logger.debug('Refresh token already revoked', { tokenId: tokenRecord.id });
    return true;
  }

  // Revoke the token
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, tokenRecord.id));

  logger.info('Refresh token revoked', { userId: tokenRecord.userId, tokenId: tokenRecord.id });

  return true;
}

/**
 * Revoke all active refresh tokens for a user
 * Useful for "logout everywhere" functionality
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const db = getDb();

  // Get all non-revoked tokens for the user
  const activeTokens = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

  // Revoke all active tokens
  const now = new Date();
  let count = 0;

  for (const token of activeTokens) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.id, token.id));
    count++;
  }

  logger.info('Revoked all user refresh tokens', { userId, count });

  return count;
}

/**
 * Get all refresh tokens for a user
 */
export async function getUserRefreshTokens(
  userId: string
): Promise<Array<{
  id: string;
  deviceName: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  isRevoked: boolean;
}>> {
  const db = getDb();

  const tokens = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.userId, userId));

  return tokens.map((token) => ({
    id: token.id,
    deviceName: token.deviceName,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    isRevoked: token.revokedAt !== null,
  }));
}

/**
 * Revoke a specific token by ID (for user management)
 */
export async function revokeRefreshTokenById(tokenId: string): Promise<boolean> {
  const db = getDb();

  const [token] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.id, tokenId))
    .limit(1);

  if (!token) {
    return false;
  }

  if (token.revokedAt !== null) {
    return true;
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, tokenId));

  return true;
}

/**
 * Delete revoked refresh tokens older than specified days
 * This is a cleanup function to prevent database bloat
 */
export async function cleanupRevokedTokens(daysOld: number = 90): Promise<number> {
  const db = getDb();

  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  // Get old revoked tokens
  const oldTokens = await db
    .select()
    .from(refreshTokens)
    .where(and(lt(refreshTokens.revokedAt, cutoffDate)));

  // Delete them
  for (const token of oldTokens) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, token.id));
  }

  logger.info('Cleaned up old revoked refresh tokens', { count: oldTokens.length, daysOld });

  return oldTokens.length;
}
