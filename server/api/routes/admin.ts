import { eq, sql, ilike, asc, desc, getTableColumns } from 'drizzle-orm';
import { getDb } from '~/server/db';
import { adminResources, getNavigationGroups, type ResourceConfig } from '~/server/admin/resources';
import { get, post, put, del, json, errorResponse, type ApiContext } from '../router';

function requireAdmin(ctx: ApiContext): Response | null {
  if (!ctx.user?.isAdmin) {
    return errorResponse('Forbidden', 403);
  }
  return null;
}

function getVisibleColumns(config: ResourceConfig) {
  const allColumns = getTableColumns(config.table);
  const visible: Record<string, any> = {};
  for (const [key, col] of Object.entries(allColumns)) {
    if (!config.hiddenColumns.includes(key)) {
      visible[key] = col;
    }
  }
  return visible;
}

function stripHiddenFields(record: Record<string, any>, config: ResourceConfig): Record<string, any> {
  const result = { ...record };
  for (const col of config.hiddenColumns) {
    delete result[col];
  }
  return result;
}

function getColumnMeta(config: ResourceConfig) {
  const allColumns = getTableColumns(config.table);
  const columns: { name: string; dataType: string; notNull: boolean; hasDefault: boolean; hidden: boolean; readOnly: boolean; enumValues?: string[] }[] = [];

  for (const [key, col] of Object.entries(allColumns)) {
    const colAny = col as any;
    columns.push({
      name: key,
      dataType: colAny.dataType ?? 'string',
      notNull: colAny.notNull ?? false,
      hasDefault: colAny.hasDefault ?? false,
      hidden: config.hiddenColumns.includes(key),
      readOnly: config.readOnlyColumns.includes(key),
      enumValues: colAny.enumValues,
    });
  }

  return columns;
}

// GET /admin/meta — Return resource metadata for the frontend
get('/admin/meta', async (ctx) => {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;

  const resources: Record<string, any> = {};
  for (const [key, config] of Object.entries(adminResources)) {
    resources[key] = {
      label: config.label,
      icon: config.icon,
      navigation: config.navigation,
      titleColumn: config.titleColumn,
      actions: config.actions,
      listColumns: config.listColumns,
      columns: getColumnMeta(config),
    };
  }

  return json({
    resources,
    navigation: getNavigationGroups(),
  });
});

// GET /admin/:resource — List records
get('/admin/:resource', async (ctx) => {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;

  const config = adminResources[ctx.params.resource];
  if (!config) return errorResponse('Resource not found', 404);

  const db = getDb();
  const page = Math.max(1, parseInt(ctx.query.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(ctx.query.get('pageSize') || '25', 10)));
  const sortBy = ctx.query.get('sortBy') || undefined;
  const sortOrder = ctx.query.get('sortOrder') === 'desc' ? 'desc' : 'asc';
  const search = ctx.query.get('search') || undefined;

  const allColumns = getTableColumns(config.table);
  const visibleColumns = getVisibleColumns(config);

  const offset = (page - 1) * pageSize;

  let countQuery = db.select({ count: sql<number>`count(*)` }).from(config.table);
  let dataQuery = db.select(visibleColumns).from(config.table);

  if (search && config.titleColumn && allColumns[config.titleColumn]) {
    const titleCol = allColumns[config.titleColumn];
    const condition = ilike(titleCol, `%${search}%`);
    countQuery = countQuery.where(condition) as any;
    dataQuery = dataQuery.where(condition) as any;
  }

  if (sortBy && allColumns[sortBy]) {
    const sortCol = allColumns[sortBy];
    dataQuery = dataQuery.orderBy(sortOrder === 'desc' ? desc(sortCol) : asc(sortCol)) as any;
  }

  dataQuery = dataQuery.limit(pageSize).offset(offset) as any;

  const [countResult, items] = await Promise.all([countQuery, dataQuery]);
  const total = Number(countResult[0]?.count ?? 0);

  return json({
    items,
    total,
    page,
    pageSize,
  });
});

// GET /admin/:resource/:id — Get single record
get('/admin/:resource/:id', async (ctx) => {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;

  const config = adminResources[ctx.params.resource];
  if (!config) return errorResponse('Resource not found', 404);

  const db = getDb();
  const allColumns = getTableColumns(config.table);
  const idCol = allColumns['id'] || allColumns['key'];
  if (!idCol) return errorResponse('Resource has no id column', 400);

  const items = await db
    .select(getVisibleColumns(config))
    .from(config.table)
    .where(eq(idCol, ctx.params.id))
    .limit(1);

  if (items.length === 0) return errorResponse('Record not found', 404);

  return json(items[0]);
});

// POST /admin/:resource — Create record
post('/admin/:resource', async (ctx) => {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;

  const config = adminResources[ctx.params.resource];
  if (!config) return errorResponse('Resource not found', 404);
  if (!config.actions.create) return errorResponse('Create not allowed for this resource', 403);

  let body: Record<string, any>;
  try {
    body = await ctx.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  for (const col of [...config.hiddenColumns, ...config.readOnlyColumns]) {
    delete body[col];
  }

  const db = getDb();
  const result = await db.insert(config.table).values(body).returning();

  return json(stripHiddenFields(result[0], config), 201);
});

// PUT /admin/:resource/:id — Update record
put('/admin/:resource/:id', async (ctx) => {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;

  const config = adminResources[ctx.params.resource];
  if (!config) return errorResponse('Resource not found', 404);
  if (!config.actions.edit) return errorResponse('Edit not allowed for this resource', 403);

  let body: Record<string, any>;
  try {
    body = await ctx.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  for (const col of [...config.hiddenColumns, ...config.readOnlyColumns]) {
    delete body[col];
  }

  const db = getDb();
  const allColumns = getTableColumns(config.table);
  const idCol = allColumns['id'] || allColumns['key'];
  if (!idCol) return errorResponse('Resource has no id column', 400);

  const result = await db
    .update(config.table)
    .set(body)
    .where(eq(idCol, ctx.params.id))
    .returning();

  if (result.length === 0) return errorResponse('Record not found', 404);

  return json(stripHiddenFields(result[0], config));
});

// DELETE /admin/:resource/:id — Delete record
del('/admin/:resource/:id', async (ctx) => {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;

  const config = adminResources[ctx.params.resource];
  if (!config) return errorResponse('Resource not found', 404);
  if (!config.actions.delete) return errorResponse('Delete not allowed for this resource', 403);

  const db = getDb();
  const allColumns = getTableColumns(config.table);
  const idCol = allColumns['id'] || allColumns['key'];
  if (!idCol) return errorResponse('Resource has no id column', 400);

  const result = await db
    .delete(config.table)
    .where(eq(idCol, ctx.params.id))
    .returning();

  if (result.length === 0) return errorResponse('Record not found', 404);

  return json({ success: true });
});
