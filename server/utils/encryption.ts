/**
 * Encryption Utilities
 *
 * Provides Fernet-compatible encryption/decryption for secrets.
 * Uses the same encryption format as the Python backend for compatibility.
 */

import crypto from 'crypto';
import { settings } from '../settings';

/**
 * Get the encryption key from settings
 */
function getEncryptionKey(): Buffer {
  const key = settings.database.ENCRYPTION_KEY;
  // Fernet keys are base64url encoded 32-byte keys
  return Buffer.from(key, 'base64url');
}

/**
 * Encrypt a secret value using Fernet-compatible symmetric encryption.
 * 
 * Fernet format:
 * - Version (1 byte): 0x80
 * - Timestamp (8 bytes): Big-endian seconds since epoch
 * - IV (16 bytes): Random initialization vector
 * - Ciphertext (variable): AES-128-CBC encrypted data
 * - HMAC (32 bytes): SHA256 HMAC of version + timestamp + iv + ciphertext
 *
 * @param value The plaintext secret to encrypt
 * @returns The encrypted secret as a base64-encoded string
 */
export function encryptSecret(value: string): string {
  const key = getEncryptionKey();
  
  // Fernet key is 32 bytes: first 16 for signing, last 16 for encryption
  const signingKey = key.slice(0, 16);
  const encryptionKey = key.slice(16, 32);
  
  // Version byte
  const version = Buffer.from([0x80]);
  
  // Timestamp (8 bytes, big-endian seconds)
  const timestamp = Buffer.alloc(8);
  const now = BigInt(Math.floor(Date.now() / 1000));
  timestamp.writeBigInt64BE(now);
  
  // Random IV (16 bytes)
  const iv = crypto.randomBytes(16);
  
  // Pad plaintext to AES block size (PKCS7 padding)
  const plaintext = Buffer.from(value, 'utf-8');
  const blockSize = 16;
  const paddingLength = blockSize - (plaintext.length % blockSize);
  const paddedPlaintext = Buffer.concat([
    plaintext,
    Buffer.alloc(paddingLength, paddingLength),
  ]);
  
  // Encrypt with AES-128-CBC
  const cipher = crypto.createCipheriv('aes-128-cbc', encryptionKey, iv);
  cipher.setAutoPadding(false); // We've already padded
  const ciphertext = Buffer.concat([cipher.update(paddedPlaintext), cipher.final()]);
  
  // Concatenate for HMAC: version + timestamp + iv + ciphertext
  const basicParts = Buffer.concat([version, timestamp, iv, ciphertext]);
  
  // HMAC-SHA256
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(basicParts);
  const signature = hmac.digest();
  
  // Final token: basic_parts + signature
  const token = Buffer.concat([basicParts, signature]);
  
  return token.toString('base64url');
}

/**
 * Decrypt a secret value using Fernet-compatible symmetric encryption.
 *
 * @param encryptedValue The encrypted secret as a base64-encoded string
 * @returns The decrypted plaintext secret
 */
export function decryptSecret(encryptedValue: string): string {
  const key = getEncryptionKey();
  
  // Fernet key is 32 bytes: first 16 for signing, last 16 for encryption
  const signingKey = key.slice(0, 16);
  const encryptionKey = key.slice(16, 32);
  
  // Decode the token
  const token = Buffer.from(encryptedValue, 'base64url');
  
  // Validate minimum length: 1 (version) + 8 (timestamp) + 16 (iv) + 16 (min ciphertext) + 32 (hmac)
  if (token.length < 73) {
    throw new Error('Invalid Fernet token: too short');
  }
  
  // Extract parts
  const version = token[0];
  if (version !== 0x80) {
    throw new Error(`Invalid Fernet version: ${version}`);
  }
  
  const hmacOffset = token.length - 32;
  const basicParts = token.slice(0, hmacOffset);
  const receivedHmac = token.slice(hmacOffset);
  
  // Verify HMAC
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(basicParts);
  const computedHmac = hmac.digest();
  
  if (!crypto.timingSafeEqual(receivedHmac, computedHmac)) {
    throw new Error('Invalid Fernet token: HMAC verification failed');
  }
  
  // Extract IV and ciphertext
  const iv = basicParts.slice(9, 25); // After version (1) + timestamp (8)
  const ciphertext = basicParts.slice(25);
  
  // Decrypt with AES-128-CBC
  const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
  decipher.setAutoPadding(false); // We'll handle padding
  const paddedPlaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  
  // Remove PKCS7 padding
  const paddingLength = paddedPlaintext[paddedPlaintext.length - 1];
  if (paddingLength > 16 || paddingLength === 0) {
    throw new Error('Invalid PKCS7 padding');
  }
  
  const plaintext = paddedPlaintext.slice(0, paddedPlaintext.length - paddingLength);
  
  return plaintext.toString('utf-8');
}

/**
 * Generate a cryptographic random key
 */
export function generateCryptographicKey(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

/**
 * Hash an API key using SHA-256 (for database storage)
 * Note: The Python backend uses argon2, but SHA-256 is sufficient for high-entropy API keys
 */
export function hashApiKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Generate a new API key with prefix
 * Returns [fullKey, prefix] tuple
 */
export function generateApiKey(): [string, string] {
  const prependPart = 'floww_sa_';
  const randomKey = generateCryptographicKey(32);
  const prefix = `${prependPart}${randomKey.slice(0, 3)}`;
  const apiKey = `${prependPart}${randomKey}`;
  
  return [apiKey, prefix];
}

/**
 * Generate a Fernet-compatible encryption key
 * Returns a base64url-encoded 32-byte key
 */
export function generateEncryptionKey(): string {
  const key = crypto.randomBytes(32);
  return key.toString('base64url');
}
