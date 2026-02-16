/**
 * Provider Routes
 *
 * GET /api/providers - List providers
 * POST /api/providers - Create provider
 * GET /api/providers/:id - Get provider
 * PATCH /api/providers/:id - Update provider
 * DELETE /api/providers/:id - Delete provider
 */

import { get, post, patch, del, json, errorResponse, parseBody } from '~/server/api/router';
import * as providerService from '~/server/services/provider-service';
import { createProviderSchema, updateProviderSchema } from '~/server/api/schemas';

// List providers
get('/providers', async (ctx) => {
  const { user, query } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const namespaceId = query.get('namespaceId') ?? undefined;

  const providers = await providerService.listProviders(user.id, { namespaceId });

  return json({
    results: providers.map((p) => ({
      id: p.id,
      namespaceId: p.namespaceId,
      type: p.type,
      alias: p.alias,
      config: p.config,
    })),
  });
});

// Create provider
post('/providers', async (ctx) => {
  const { user, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, createProviderSchema);
  if ('error' in parsed) return parsed.error;

  const { namespaceId, type, alias, config } = parsed.data;

  const provider = await providerService.createProvider({
    namespaceId,
    type,
    alias,
    config: config ?? {},
  });

  return json({
    id: provider.id,
    namespaceId: provider.namespaceId,
    type: provider.type,
    alias: provider.alias,
    config: provider.config,
  }, 201);
});

// Get provider
get('/providers/:providerId', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const hasAccess = await providerService.hasProviderAccess(user.id, params.providerId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const provider = await providerService.getProvider(params.providerId);
  if (!provider) {
    return errorResponse('Provider not found', 404);
  }

  return json({
    id: provider.id,
    namespaceId: provider.namespaceId,
    type: provider.type,
    alias: provider.alias,
    config: provider.config,
  });
});

// Update provider
patch('/providers/:providerId', async (ctx) => {
  const { user, params, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const hasAccess = await providerService.hasProviderAccess(user.id, params.providerId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const parsed = await parseBody(request, updateProviderSchema);
  if ('error' in parsed) return parsed.error;

  const provider = await providerService.updateProvider(params.providerId, {
    type: parsed.data.type,
    alias: parsed.data.alias,
    config: parsed.data.config,
  });

  if (!provider) {
    return errorResponse('Provider not found', 404);
  }

  return json({
    id: provider.id,
    namespaceId: provider.namespaceId,
    type: provider.type,
    alias: provider.alias,
    config: provider.config,
  });
});

// Delete provider
del('/providers/:providerId', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const hasAccess = await providerService.hasProviderAccess(user.id, params.providerId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  await providerService.deleteProvider(params.providerId);

  return json({ success: true });
});
