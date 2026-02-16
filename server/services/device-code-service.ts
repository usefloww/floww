/**
 * Device Code Service
 *
 * Handles OAuth2 device authorization flow for CLI and other device authentication.
 */

import crypto from 'crypto';
import { eq, lt } from 'drizzle-orm';
import { getDb } from '~/server/db';
import { deviceCodes, type DeviceCode } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { logger } from '~/server/utils/logger';

export type DeviceCodeStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';

export interface DeviceAuthorizationData {
  deviceCode: string;
  userCode: string;
  expiresIn: number;
  interval: number;
}

// Device code configuration
const DEVICE_CODE_EXPIRY_SECONDS = 900; // 15 minutes
const POLL_INTERVAL_SECONDS = 5;

/**
 * Generate a secure device code (43-char URL-safe string)
 */
function generateDeviceCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a human-readable user code in format XXXX-XXXX
 * Uses characters that are easy to read (excludes 0, O, 1, I)
 */
function generateUserCode(): string {
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const part1 = Array.from({ length: 4 }, () =>
    charset[crypto.randomInt(charset.length)]
  ).join('');
  const part2 = Array.from({ length: 4 }, () =>
    charset[crypto.randomInt(charset.length)]
  ).join('');
  return `${part1}-${part2}`;
}

/**
 * Create a new device authorization request
 */
export async function createDeviceAuthorization(): Promise<DeviceAuthorizationData> {
  const db = getDb();

  const deviceCode = generateDeviceCode();
  let userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRY_SECONDS * 1000);

  // Ensure user code is unique
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const [existing] = await db
      .select()
      .from(deviceCodes)
      .where(eq(deviceCodes.userCode, userCode))
      .limit(1);

    if (!existing) {
      break;
    }
    userCode = generateUserCode();

    if (i === maxAttempts - 1) {
      throw new Error('Failed to generate unique user code after multiple attempts');
    }
  }

  // Create device code record
  await db.insert(deviceCodes).values({
    id: generateUlidUuid(),
    deviceCode,
    userCode,
    status: 'PENDING',
    expiresAt,
  });

  logger.info('Created device authorization', { userCode, expiresAt: expiresAt.toISOString() });

  return {
    deviceCode,
    userCode,
    expiresIn: DEVICE_CODE_EXPIRY_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  };
}

/**
 * Get a device code record by user code
 */
export async function getDeviceCodeByUserCode(userCode: string): Promise<DeviceCode | null> {
  const db = getDb();

  const [record] = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.userCode, userCode.toUpperCase()))
    .limit(1);

  return record ?? null;
}

/**
 * Get a device code record by device code
 */
export async function getDeviceCodeByDeviceCode(deviceCode: string): Promise<DeviceCode | null> {
  const db = getDb();

  const [record] = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.deviceCode, deviceCode))
    .limit(1);

  return record ?? null;
}

/**
 * Approve a device code for a specific user
 */
export async function approveDeviceCode(userCode: string, userId: string): Promise<boolean> {
  const db = getDb();

  const record = await getDeviceCodeByUserCode(userCode);
  if (!record) {
    logger.warn('Device code not found', { userCode });
    return false;
  }

  // Check if expired
  if (new Date() > record.expiresAt) {
    await db
      .update(deviceCodes)
      .set({ status: 'EXPIRED' })
      .where(eq(deviceCodes.id, record.id));
    logger.warn('Device code expired', { userCode });
    return false;
  }

  // Check if already used
  if (record.status !== 'PENDING') {
    logger.warn('Device code already used', { userCode, status: record.status });
    return false;
  }

  // Approve the device code
  await db
    .update(deviceCodes)
    .set({ status: 'APPROVED', userId })
    .where(eq(deviceCodes.id, record.id));

  logger.info('Device code approved', { userCode, userId });
  return true;
}

/**
 * Deny a device code request
 */
export async function denyDeviceCode(userCode: string): Promise<boolean> {
  const db = getDb();

  const record = await getDeviceCodeByUserCode(userCode);
  if (!record) {
    return false;
  }

  await db
    .update(deviceCodes)
    .set({ status: 'DENIED' })
    .where(eq(deviceCodes.id, record.id));

  logger.info('Device code denied', { userCode });
  return true;
}

/**
 * Check the status of a device code for polling
 */
export async function checkDeviceCodeStatus(
  deviceCode: string
): Promise<{ status: DeviceCodeStatus; userId: string | null }> {
  const db = getDb();

  const record = await getDeviceCodeByDeviceCode(deviceCode);
  if (!record) {
    return { status: 'EXPIRED', userId: null };
  }

  // Check if expired
  if (new Date() > record.expiresAt && record.status === 'PENDING') {
    await db
      .update(deviceCodes)
      .set({ status: 'EXPIRED' })
      .where(eq(deviceCodes.id, record.id));
    return { status: 'EXPIRED', userId: null };
  }

  return { status: record.status, userId: record.userId };
}

/**
 * Delete a device code (after successful token exchange)
 */
export async function deleteDeviceCode(deviceCode: string): Promise<void> {
  const db = getDb();

  await db.delete(deviceCodes).where(eq(deviceCodes.deviceCode, deviceCode));

  logger.debug('Device code deleted', { deviceCode: deviceCode.slice(0, 10) + '...' });
}

/**
 * Clean up expired device codes
 */
export async function cleanupExpiredDeviceCodes(): Promise<number> {
  const db = getDb();

  const now = new Date();

  // Find and delete expired codes
  const expiredCodes = await db
    .select()
    .from(deviceCodes)
    .where(lt(deviceCodes.expiresAt, now));

  for (const code of expiredCodes) {
    await db.delete(deviceCodes).where(eq(deviceCodes.id, code.id));
  }

  logger.info('Cleaned up expired device codes', { count: expiredCodes.length });
  return expiredCodes.length;
}
