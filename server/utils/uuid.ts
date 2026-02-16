/**
 * UUID generation utilities using ULID for time-ordered identifiers.
 * This implementation must match the Python version in floww-backend/app/utils/uuid_utils.py
 *
 * Python implementation:
 *   ulid = ULID()
 *   return UUID(bytes=ulid.bytes)
 */

import { ulid, ulidToUUID } from 'ulidx';

/**
 * Generate a UUID from a ULID (Universally Unique Lexicographically Sortable Identifier).
 *
 * ULIDs are time-ordered, making them better for database ordering than standard UUIDs.
 * This function generates a ULID and converts it to a UUID format compatible with PostgreSQL.
 *
 * @returns A UUID string generated from a ULID
 */
export function generateUlidUuid(): string {
  // Generate a new ULID
  const ulidValue = ulid();

  // Convert ULID to UUID format using the built-in function
  // This converts the 26-character ULID to a 36-character UUID with dashes
  return ulidToUUID(ulidValue);
}
