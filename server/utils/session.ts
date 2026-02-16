/**
 * Session cookie utilities
 *
 * Parses and creates session cookies compatible with Python's itsdangerous.URLSafeTimedSerializer.
 * The format is: payload.timestamp.signature
 * - payload is URL-safe base64 encoded JSON
 * - timestamp is URL-safe base64 encoded 4-byte big-endian integer (Unix timestamp)
 * - signature is HMAC-SHA1 of payload.timestamp
 */

import crypto from 'crypto';
import zlib from 'zlib';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

/**
 * Encode data as URL-safe base64 (RFC 4648)
 */
function urlSafeBase64Encode(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode URL-safe base64 (RFC 4648)
 */
function urlSafeBase64Decode(input: string): Buffer {
  // Replace URL-safe characters with standard base64 characters
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if necessary
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }

  return Buffer.from(base64, 'base64');
}

/**
 * Create HMAC signature using itsdangerous algorithm
 */
function createSignature(secretKey: string, value: string): string {
  // itsdangerous uses HMAC-SHA1 with a derived key
  // The key is derived using HMAC-SHA1(secret, "itsdangerous.Signer")
  const derivedKey = crypto
    .createHmac('sha1', secretKey)
    .update('itsdangerous.Signer')
    .digest();

  const sig = crypto.createHmac('sha1', derivedKey).update(value).digest();

  return urlSafeBase64Encode(sig);
}

/**
 * Verify HMAC signature using itsdangerous algorithm
 */
function verifySignature(
  secretKey: string,
  value: string,
  signature: string
): boolean {
  // itsdangerous uses HMAC-SHA1 with a derived key
  // The key is derived using HMAC-SHA1(secret, "itsdangerous.Signer")
  const derivedKey = crypto
    .createHmac('sha1', secretKey)
    .update('itsdangerous.Signer')
    .digest();

  const expectedSig = crypto
    .createHmac('sha1', derivedKey)
    .update(value)
    .digest();

  const actualSig = urlSafeBase64Decode(signature);

  // Use timing-safe comparison
  if (expectedSig.length !== actualSig.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedSig, actualSig);
}

/**
 * Create a session cookie value compatible with Python's itsdangerous
 *
 * @param jwtToken - The JWT token to store in the session
 * @param secretKey - The SESSION_SECRET_KEY used to sign the cookie
 * @returns The signed session cookie value
 */
export function createSessionCookie(
  jwtToken: string,
  secretKey?: string
): string {
  const key = secretKey || settings.database.SESSION_SECRET_KEY;
  if (!key) {
    throw new Error('SESSION_SECRET_KEY not configured');
  }

  // JSON-encode the JWT token
  const payload = JSON.stringify(jwtToken);

  // URL-safe base64 encode the payload
  const encodedPayload = urlSafeBase64Encode(Buffer.from(payload, 'utf-8'));

  // Create timestamp (current Unix time as 4-byte big-endian)
  const timestamp = Math.floor(Date.now() / 1000);
  const timestampBytes = Buffer.alloc(4);
  timestampBytes.writeUInt32BE(timestamp, 0);
  const encodedTimestamp = urlSafeBase64Encode(timestampBytes);

  // Create signature
  const signedValue = `${encodedPayload}.${encodedTimestamp}`;
  const signature = createSignature(key, signedValue);

  return `${signedValue}.${signature}`;
}

const SESSION_MAX_AGE = 30 * 24 * 3600; // 30 days

/**
 * Build the full Set-Cookie header value for a session cookie.
 * Use this when sending the session to the client.
 */
export function buildSessionSetCookieHeader(
  jwtToken: string,
  options?: { secure?: boolean }
): string {
  const value = createSessionCookie(jwtToken);
  const secure = options?.secure ?? false;
  return `session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure ? '; Secure' : ''}`;
}

/**
 * Parse a session cookie created by Python's itsdangerous.URLSafeTimedSerializer
 *
 * @param cookieValue - The session cookie value
 * @param secretKey - The SESSION_SECRET_KEY used to sign the cookie
 * @param maxAgeSeconds - Maximum age of the cookie in seconds (default: 30 days)
 * @returns The JWT token stored in the session, or null if invalid
 */
export function parseSessionCookie(
  cookieValue: string,
  secretKey: string,
  maxAgeSeconds: number = 30 * 24 * 3600
): string | null {
  try {
    // Split into payload.timestamp.signature
    const parts = cookieValue.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedPayload, encodedTimestamp, signature] = parts;

    // Verify signature
    const signedValue = `${encodedPayload}.${encodedTimestamp}`;
    if (!verifySignature(secretKey, signedValue, signature)) {
      return null;
    }

    // Decode timestamp and check age
    const timestampBytes = urlSafeBase64Decode(encodedTimestamp);
    const timestamp = timestampBytes.readUInt32BE(0);
    const now = Math.floor(Date.now() / 1000);

    if (now - timestamp > maxAgeSeconds) {
      return null; // Cookie expired
    }

    // Decode payload (it's a JSON-encoded string, then base64 encoded)
    const payloadBytes = urlSafeBase64Decode(encodedPayload);

    // The payload is zlib-compressed if it starts with '.'
    // Otherwise it's just the raw JSON string
    let payloadStr: string;

    if (payloadBytes[0] === 0x2e) {
      // Starts with '.', meaning it's compressed
      // Remove the '.' prefix and decompress
      const compressed = payloadBytes.slice(1);
      payloadStr = zlib.inflateSync(compressed).toString('utf-8');
    } else {
      payloadStr = payloadBytes.toString('utf-8');
    }

    // The payload is JSON-encoded (a string containing the JWT)
    // itsdangerous wraps the value in JSON
    const jwt = JSON.parse(payloadStr);

    return typeof jwt === 'string' ? jwt : null;
  } catch (error) {
    logger.error('Failed to parse session cookie', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Extract JWT from a session cookie value
 * This is the main entry point for getting the JWT from the session
 */
export function getJwtFromSessionCookie(
  cookieValue: string,
  secretKey?: string
): string | null {
  const key = secretKey || settings.database.SESSION_SECRET_KEY;
  if (!key) {
    logger.error('SESSION_SECRET_KEY not configured');
    return null;
  }

  return parseSessionCookie(cookieValue, key);
}

/**
 * Sign state data for OAuth CSRF protection
 * Compatible with Python's itsdangerous
 */
export function signState(data: { csrf: string; next: string }): string {
  const key = settings.database.SESSION_SECRET_KEY;
  if (!key) {
    throw new Error('SESSION_SECRET_KEY not configured');
  }

  const payload = JSON.stringify(data);
  const encodedPayload = urlSafeBase64Encode(Buffer.from(payload, 'utf-8'));

  const timestamp = Math.floor(Date.now() / 1000);
  const timestampBytes = Buffer.alloc(4);
  timestampBytes.writeUInt32BE(timestamp, 0);
  const encodedTimestamp = urlSafeBase64Encode(timestampBytes);

  const signedValue = `${encodedPayload}.${encodedTimestamp}`;
  const signature = createSignature(key, signedValue);

  return `${signedValue}.${signature}`;
}

/**
 * Verify and parse signed state data
 */
export function parseState(
  signedState: string,
  maxAgeSeconds: number = 600
): { csrf: string; next: string } | null {
  const key = settings.database.SESSION_SECRET_KEY;
  if (!key) {
    logger.error('SESSION_SECRET_KEY not configured');
    return null;
  }

  try {
    const parts = signedState.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedPayload, encodedTimestamp, signature] = parts;

    // Verify signature
    const signedValue = `${encodedPayload}.${encodedTimestamp}`;
    if (!verifySignature(key, signedValue, signature)) {
      return null;
    }

    // Check timestamp
    const timestampBytes = urlSafeBase64Decode(encodedTimestamp);
    const timestamp = timestampBytes.readUInt32BE(0);
    const now = Math.floor(Date.now() / 1000);

    if (now - timestamp > maxAgeSeconds) {
      return null;
    }

    // Decode payload
    const payloadBytes = urlSafeBase64Decode(encodedPayload);
    const payloadStr = payloadBytes.toString('utf-8');
    const data = JSON.parse(payloadStr);

    return data;
  } catch (error) {
    logger.error('Failed to parse state', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Check if a redirect URL is safe (same host or relative)
 */
export function isSafeRedirectUrl(url: string, requestHost: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url, `http://${requestHost}`);

    // Allow relative URLs
    if (!url.includes('://')) {
      return url.startsWith('/');
    }

    // For absolute URLs, check same host
    return parsed.host.toLowerCase() === requestHost.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Create a Set-Cookie header to clear the session cookie
 */
export function clearSessionCookie(): string {
  return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}
