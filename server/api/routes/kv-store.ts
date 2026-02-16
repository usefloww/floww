/**
 * KV Store Routes
 *
 * Key-Value store operations for workflow state storage.
 *
 * GET /kv/:provider - List tables
 * GET /kv/:provider/:table - List KV pairs
 * GET /kv/:provider/:table/:key - Get value
 * PUT /kv/:provider/:table/:key - Set value
 * DELETE /kv/:provider/:table/:key - Delete value
 * GET /kv/:provider/permissions/:table - Get permissions
 * POST /kv/:provider/permissions/:table - Set permissions
 * DELETE /kv/:provider/permissions/:table/:workflowId - Remove permissions
 */

import { eq, and } from 'drizzle-orm';
import { get, post, put, del, json, errorResponse, parseBody } from '~/server/api/router';
import { getDb } from '~/server/db';
import { kvTables, kvItems, kvTablePermissions, providers, namespaces, organizationMembers } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { setKvValueSchema, setKvPermissionsSchema } from '~/server/api/schemas';

// Helper to check KV provider access
async function checkKvAccess(userId: string, providerAlias: string): Promise<string | null> {
  const db = getDb();

  const result = await db
    .select({ providerId: providers.id })
    .from(providers)
    .innerJoin(namespaces, eq(providers.namespaceId, namespaces.id))
    .innerJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, namespaces.organizationOwnerId),
        eq(organizationMembers.userId, userId)
      )
    )
    .where(and(eq(providers.alias, providerAlias), eq(providers.type, 'kv')))
    .limit(1);

  return result.length > 0 ? result[0].providerId : null;
}

// Helper to get or create a table
async function getOrCreateTable(providerId: string, tableName: string): Promise<string> {
  const db = getDb();

  // Check if table exists
  const existing = await db
    .select({ id: kvTables.id })
    .from(kvTables)
    .where(and(eq(kvTables.providerId, providerId), eq(kvTables.name, tableName)))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create table
  const newTable = await db
    .insert(kvTables)
    .values({
      id: generateUlidUuid(),
      providerId,
      name: tableName,
    })
    .returning();

  return newTable[0].id;
}

// List tables for a KV provider
get('/kv/:provider', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const providerId = await checkKvAccess(user.id, params.provider);
  if (!providerId) {
    return errorResponse('KV provider not found', 404);
  }

  const db = getDb();

  // Get all tables for this provider
  const tables = await db
    .select({ name: kvTables.name })
    .from(kvTables)
    .where(eq(kvTables.providerId, providerId));

  return json({
    results: tables.map((t) => t.name),
  });
});

// List KV pairs in a table
get('/kv/:provider/:table', async ({ user, params, query }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const providerId = await checkKvAccess(user.id, params.provider);
  if (!providerId) {
    return errorResponse('KV provider not found', 404);
  }

  const db = getDb();
  const limit = parseInt(query.get('limit') ?? '100', 10);
  const offset = parseInt(query.get('offset') ?? '0', 10);

  // Get table ID
  const tableResult = await db
    .select({ id: kvTables.id })
    .from(kvTables)
    .where(and(eq(kvTables.providerId, providerId), eq(kvTables.name, params.table)))
    .limit(1);

  if (tableResult.length === 0) {
    return json({ results: [] });
  }

  const tableId = tableResult[0].id;

  const pairs = await db
    .select({
      key: kvItems.key,
      value: kvItems.value,
      createdAt: kvItems.createdAt,
      updatedAt: kvItems.updatedAt,
    })
    .from(kvItems)
    .where(eq(kvItems.tableId, tableId))
    .limit(limit)
    .offset(offset);

  return json({
    results: pairs.map((p) => ({
      key: p.key,
      value: p.value,
      createdAt: p.createdAt?.toISOString(),
      updatedAt: p.updatedAt?.toISOString(),
    })),
  });
});

// Get single value
get('/kv/:provider/:table/:key', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const providerId = await checkKvAccess(user.id, params.provider);
  if (!providerId) {
    return errorResponse('KV provider not found', 404);
  }

  const db = getDb();

  // Get table ID
  const tableResult = await db
    .select({ id: kvTables.id })
    .from(kvTables)
    .where(and(eq(kvTables.providerId, providerId), eq(kvTables.name, params.table)))
    .limit(1);

  if (tableResult.length === 0) {
    return errorResponse('Key not found', 404);
  }

  const tableId = tableResult[0].id;

  const result = await db
    .select({ value: kvItems.value, updatedAt: kvItems.updatedAt })
    .from(kvItems)
    .where(and(eq(kvItems.tableId, tableId), eq(kvItems.key, params.key)))
    .limit(1);

  if (result.length === 0) {
    return errorResponse('Key not found', 404);
  }

  return json({
    key: params.key,
    value: result[0].value,
    updatedAt: result[0].updatedAt?.toISOString(),
  });
});

// Set value
put('/kv/:provider/:table/:key', async ({ user, params, request }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const providerId = await checkKvAccess(user.id, params.provider);
  if (!providerId) {
    return errorResponse('KV provider not found', 404);
  }

  const parsed = await parseBody(request, setKvValueSchema);
  if ('error' in parsed) return parsed.error;

  const { value } = parsed.data;
  const db = getDb();

  // Get or create table
  const tableId = await getOrCreateTable(providerId, params.table);

  // Check if key exists
  const existing = await db
    .select({ id: kvItems.id })
    .from(kvItems)
    .where(and(eq(kvItems.tableId, tableId), eq(kvItems.key, params.key)))
    .limit(1);

  if (existing.length > 0) {
    // Update
    await db
      .update(kvItems)
      .set({ value, updatedAt: new Date() })
      .where(eq(kvItems.id, existing[0].id));
  } else {
    // Insert
    await db.insert(kvItems).values({
      id: generateUlidUuid(),
      tableId,
      key: params.key,
      value,
    });
  }

  return json({ success: true });
});

// Delete value
del('/kv/:provider/:table/:key', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const providerId = await checkKvAccess(user.id, params.provider);
  if (!providerId) {
    return errorResponse('KV provider not found', 404);
  }

  const db = getDb();

  // Get table ID
  const tableResult = await db
    .select({ id: kvTables.id })
    .from(kvTables)
    .where(and(eq(kvTables.providerId, providerId), eq(kvTables.name, params.table)))
    .limit(1);

  if (tableResult.length === 0) {
    return errorResponse('Key not found', 404);
  }

  const tableId = tableResult[0].id;

  await db
    .delete(kvItems)
    .where(and(eq(kvItems.tableId, tableId), eq(kvItems.key, params.key)));

  return json({ success: true });
});

// Get permissions for a table
get('/kv/:provider/permissions/:table', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const providerId = await checkKvAccess(user.id, params.provider);
  if (!providerId) {
    return errorResponse('KV provider not found', 404);
  }

  const db = getDb();

  // Get table ID
  const tableResult = await db
    .select({ id: kvTables.id })
    .from(kvTables)
    .where(and(eq(kvTables.providerId, providerId), eq(kvTables.name, params.table)))
    .limit(1);

  if (tableResult.length === 0) {
    return json({ results: [] });
  }

  const tableId = tableResult[0].id;

  const permissions = await db
    .select({
      workflowId: kvTablePermissions.workflowId,
      canRead: kvTablePermissions.canRead,
      canWrite: kvTablePermissions.canWrite,
    })
    .from(kvTablePermissions)
    .where(eq(kvTablePermissions.tableId, tableId));

  return json({ results: permissions });
});

// Set permissions for a table
post('/kv/:provider/permissions/:table', async ({ user, params, request }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const providerId = await checkKvAccess(user.id, params.provider);
  if (!providerId) {
    return errorResponse('KV provider not found', 404);
  }

  const parsed = await parseBody(request, setKvPermissionsSchema);
  if ('error' in parsed) return parsed.error;

  const { workflowId, canRead, canWrite } = parsed.data;
  const db = getDb();

  // Get or create table
  const tableId = await getOrCreateTable(providerId, params.table);

  // Check if permission exists
  const existing = await db
    .select({ id: kvTablePermissions.id })
    .from(kvTablePermissions)
    .where(
      and(eq(kvTablePermissions.tableId, tableId), eq(kvTablePermissions.workflowId, workflowId))
    )
    .limit(1);

  if (existing.length > 0) {
    // Update
    await db
      .update(kvTablePermissions)
      .set({ canRead, canWrite })
      .where(eq(kvTablePermissions.id, existing[0].id));
  } else {
    // Insert
    await db.insert(kvTablePermissions).values({
      id: generateUlidUuid(),
      tableId,
      workflowId,
      canRead,
      canWrite,
    });
  }

  return json({ success: true });
});

// Remove permissions for a workflow
del('/kv/:provider/permissions/:table/:workflowId', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const providerId = await checkKvAccess(user.id, params.provider);
  if (!providerId) {
    return errorResponse('KV provider not found', 404);
  }

  const db = getDb();

  // Get table ID
  const tableResult = await db
    .select({ id: kvTables.id })
    .from(kvTables)
    .where(and(eq(kvTables.providerId, providerId), eq(kvTables.name, params.table)))
    .limit(1);

  if (tableResult.length === 0) {
    return errorResponse('Table not found', 404);
  }

  const tableId = tableResult[0].id;

  await db
    .delete(kvTablePermissions)
    .where(
      and(
        eq(kvTablePermissions.tableId, tableId),
        eq(kvTablePermissions.workflowId, params.workflowId)
      )
    );

  return json({ success: true });
});
