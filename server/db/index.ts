import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { settings } from '../settings';

// Lazy initialization to avoid issues with Vite SSR
let _client: postgres.Sql | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getConnectionString(): string {
  return settings.database.DATABASE_URL;
}

/**
 * Get the postgres client (lazy initialization)
 */
export function getClient(): postgres.Sql {
  if (!_client) {
    _client = postgres(getConnectionString());
  }
  return _client;
}

/**
 * Get the drizzle database instance (lazy initialization)
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getClient(), { schema });
  }
  return _db;
}

// Export type for use in other modules
export type Database = PostgresJsDatabase<typeof schema>;
