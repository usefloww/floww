/**
 * Migration Runner Script
 *
 * Run database migrations using Drizzle ORM.
 * Usage: pnpm db:migrate
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { settings } from '~/server/settings';

const connectionString = settings.database.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function runMigrations() {
  console.log('Running migrations...');
  
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  
  console.log(`Database: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: './server/db/migrations' });
    console.log('Migrations complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
