/**
 * CRUD Helpers
 *
 * Generic helper functions for common CRUD operations with Drizzle ORM.
 */

import { sql, eq, and, desc, asc } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { getDb } from '~/server/db';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Build a paginated query result
 */
export async function paginatedQuery<T extends Record<string, unknown>>(
  table: PgTable,
  options: PaginationOptions & {
    where?: ReturnType<typeof and>;
    orderColumn?: PgColumn;
  } = {}
): Promise<PaginatedResult<T>> {
  const db = getDb();
  const { limit = 50, offset = 0, orderDir = 'desc', where, orderColumn } = options;

  // Get total count
  let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(table);
  if (where) {
    countQuery = countQuery.where(where) as typeof countQuery;
  }
  const [{ count: total }] = await countQuery;

  // Get items
  let query = db.select().from(table);
  if (where) {
    query = query.where(where) as typeof query;
  }
  if (orderColumn) {
    query = query.orderBy(orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn)) as typeof query;
  }
  query = query.limit(limit).offset(offset) as typeof query;

  const items = (await query) as T[];

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

/**
 * Get a single record by ID
 */
export async function getById<T extends Record<string, unknown>>(
  table: PgTable,
  idColumn: PgColumn,
  id: string
): Promise<T | null> {
  const db = getDb();

  const [item] = await db.select().from(table).where(eq(idColumn, id)).limit(1);

  return (item as T) ?? null;
}

/**
 * Check if a record exists
 */
export async function exists(
  table: PgTable,
  idColumn: PgColumn,
  id: string
): Promise<boolean> {
  const db = getDb();

  const [item] = await db
    .select({ id: idColumn })
    .from(table)
    .where(eq(idColumn, id))
    .limit(1);

  return !!item;
}

/**
 * Delete a record by ID
 */
export async function deleteById(
  table: PgTable,
  idColumn: PgColumn,
  id: string
): Promise<boolean> {
  const db = getDb();

  await db.delete(table).where(eq(idColumn, id));

  return true;
}

/**
 * Count records matching a condition
 */
export async function countWhere(
  table: PgTable,
  where?: ReturnType<typeof and>
): Promise<number> {
  const db = getDb();

  let query = db.select({ count: sql<number>`count(*)::int` }).from(table);
  if (where) {
    query = query.where(where) as typeof query;
  }

  const [{ count }] = await query;
  return count;
}

/**
 * Soft delete a record by setting a deleted_at timestamp
 * (Only works if the table has a deleted_at column)
 */
export async function softDeleteById(
  table: PgTable,
  idColumn: PgColumn,
  deletedAtColumn: PgColumn,
  id: string
): Promise<boolean> {
  const db = getDb();

  await db
    .update(table)
    .set({ [deletedAtColumn.name]: new Date() } as Record<string, unknown>)
    .where(eq(idColumn, id));

  return true;
}

/**
 * Batch insert records
 */
export async function batchInsert<T extends Record<string, unknown>>(
  table: PgTable,
  records: T[],
  batchSize: number = 100
): Promise<number> {
  const db = getDb();
  let inserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await db.insert(table).values(batch);
    inserted += batch.length;
  }

  return inserted;
}

/**
 * Upsert a record (insert or update on conflict)
 */
export async function upsert<T extends Record<string, unknown>>(
  table: PgTable,
  record: T,
  conflictColumns: PgColumn[],
  updateColumns: (keyof T)[]
): Promise<T> {
  const db = getDb();

  const updateSet: Record<string, unknown> = {};
  for (const col of updateColumns) {
    updateSet[col as string] = record[col];
  }

  const [result] = await db
    .insert(table)
    .values(record)
    .onConflictDoUpdate({
      target: conflictColumns,
      set: updateSet,
    })
    .returning();

  return result as T;
}
