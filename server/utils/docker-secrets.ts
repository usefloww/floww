/**
 * Docker Secrets Utility
 *
 * Reads Docker secrets from files when *_FILE environment variables are present.
 * This allows secure secret management in production Docker environments.
 *
 * Example:
 *   If AUTH_CLIENT_SECRET_FILE=/run/secrets/auth_client_secret
 *   Then readDockerSecret('AUTH_CLIENT_SECRET') will read from that file
 */

import { existsSync, readFileSync } from 'fs';
import { logger } from './logger';

/**
 * Read a Docker secret from a file if the corresponding *_FILE environment variable exists.
 *
 * @param fieldName The name of the field (e.g., 'AUTH_CLIENT_SECRET')
 * @returns The secret value from the file, or undefined if not found
 */
export function readDockerSecret(fieldName: string): string | undefined {
  const fileEnvName = `${fieldName}_FILE`;
  const filePath = process.env[fileEnvName];

  if (!filePath) {
    return undefined;
  }

  if (!existsSync(filePath)) {
    logger.warn(`Docker secret file not found: ${filePath} (from ${fileEnvName})`);
    return undefined;
  }

  try {
    const secretValue = readFileSync(filePath, 'utf-8').trim();
    return secretValue;
  } catch (error) {
    logger.warn(
      `Could not read Docker secret from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

/**
 * Get an environment variable value, checking Docker secrets first.
 * Priority: Docker secret file > Environment variable > undefined
 *
 * @param fieldName The name of the field (e.g., 'AUTH_CLIENT_SECRET')
 * @returns The value from Docker secret, env var, or undefined
 */
export function getEnvWithSecret(fieldName: string): string | undefined {
  // Check Docker secret first
  const secretValue = readDockerSecret(fieldName);
  if (secretValue !== undefined) {
    return secretValue;
  }

  // Fall back to environment variable
  return process.env[fieldName];
}
