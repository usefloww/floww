/**
 * Runtime Routes
 *
 * GET /api/runtimes - List runtimes
 * GET /api/runtimes/:id - Get runtime
 * POST /api/runtimes - Create runtime
 */

import { get, post, json, errorResponse, parseBody } from '~/server/api/router';
import * as runtimeService from '~/server/services/runtime-service';
import { getDefaultRuntimeId } from '~/server/services/default-runtime';
import { createRuntimeSchema } from '~/server/api/schemas';

// List runtimes
get('/runtimes', async (ctx) => {
  const { user, query } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const status = query.get('status') as runtimeService.RuntimeCreationStatus | null;
  const limit = parseInt(query.get('limit') ?? '50', 10);
  const offset = parseInt(query.get('offset') ?? '0', 10);

  const runtimes = await runtimeService.listRuntimes({
    status: status ?? undefined,
    limit,
    offset,
  });

  const defaultRuntimeId = await getDefaultRuntimeId();

  return json({
    results: runtimes.map((r) => ({
      id: r.id,
      config: r.config,
      configHash: r.configHash,
      creationStatus: r.creationStatus,
      createdAt: r.createdAt.toISOString(),
      isDefault: r.id === defaultRuntimeId,
    })),
    defaultRuntimeId,
  });
});

// Get runtime
get('/runtimes/:runtimeId', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  try {
    const runtime = await runtimeService.getRuntime(params.runtimeId);
    if (!runtime) {
      return errorResponse('Runtime not found', 404);
    }

    const defaultRuntimeId = await getDefaultRuntimeId();

    return json({
      id: runtime.id,
      config: runtime.config,
      configHash: runtime.configHash,
      creationStatus: runtime.creationStatus,
      creationLogs: runtime.creationLogs,
      createdAt: runtime.createdAt.toISOString(),
      isDefault: runtime.id === defaultRuntimeId,
    });
  } catch (error) {
    // Database errors (e.g., invalid UUID format) should return 404
    return errorResponse('Runtime not found', 404);
  }
});

// Create runtime
post('/runtimes', async (ctx) => {
  const { user, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  // Only admins can create runtimes
  if (!user.isAdmin) {
    return errorResponse('Admin access required', 403);
  }

  const parsed = await parseBody(request, createRuntimeSchema);
  if ('error' in parsed) return parsed.error;

  const runtime = await runtimeService.createRuntime(parsed.data.config);

  return json({
    id: runtime.id,
    configHash: runtime.configHash,
    creationStatus: runtime.creationStatus,
    createdAt: runtime.createdAt.toISOString(),
  }, 201);
});
