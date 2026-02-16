/**
 * Health Check Route
 *
 * GET /api/health - System health check
 */

import { get, json } from '~/server/api/router';
import { getDb } from '~/server/db';
import { sql } from 'drizzle-orm';

get('/health', async () => {
  try {
    const db = getDb();
    
    // Check database connection
    await db.execute(sql`SELECT 1`);

    return json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'ok',
      },
    });
  } catch (error) {
    return json({
      status: 'error',
      timestamp: new Date().toISOString(),
      services: {
        database: 'error',
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 503);
  }
}, false); // No auth required
