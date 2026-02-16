/**
 * Global setup script - runs ONCE before all tests start
 * This handles database migrations.
 */

import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';

// Load environment variables
dotenv.config({ path: '.env' });

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://admin:secret@localhost:5432/floww_test';

export default async function setup() {
  console.log('=== Global Test Setup ===');
  console.log(`Connecting to: ${TEST_DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const client = postgres(TEST_DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  try {
    console.log('Running migrations...');
    const migrationsPath = path.resolve(process.cwd(), 'server/db/migrations');
    await migrate(db, { migrationsFolder: migrationsPath });
    console.log('Migrations complete');
  } finally {
    await client.end();
  }

  console.log('=== Global setup complete ===');
}
