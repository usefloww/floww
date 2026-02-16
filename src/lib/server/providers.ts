import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export interface ProviderInfo {
  id: string;
  namespaceId: string;
  type: string;
  alias: string;
  config: { [x: string]: {} };
}

/**
 * List providers for the current user
 */
export const getProviders = createServerFn({ method: 'GET' })
  .inputValidator((input: { namespaceId?: string } | undefined) => input ?? {})
  .handler(async ({ data = {} }): Promise<{ results: ProviderInfo[] }> => {
    const user = await requireUser();
    const { listProviders } = await import('~/server/services/provider-service');

    const providers = await listProviders(user.id, { 
      namespaceId: data?.namespaceId 
    });

    return {
      results: providers.map((p) => ({
        id: p.id,
        namespaceId: p.namespaceId,
        type: p.type,
        alias: p.alias,
        config: p.config as { [x: string]: {} },
      })),
    };
  });

/**
 * Get a single provider by ID
 */
export const getProvider = createServerFn({ method: 'GET' })
  .inputValidator((input: { providerId: string }) => input)
  .handler(async ({ data }): Promise<ProviderInfo> => {
    const user = await requireUser();
    const { getProvider: get, hasProviderAccess } = await import('~/server/services/provider-service');

    const hasAccess = await hasProviderAccess(user.id, data.providerId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const provider = await get(data.providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    return {
      id: provider.id,
      namespaceId: provider.namespaceId,
      type: provider.type,
      alias: provider.alias,
      config: provider.config as { [x: string]: {} },
    };
  });

/**
 * Create a new provider
 */
export const createProvider = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    namespaceId: string;
    type: string;
    alias: string;
    config?: Record<string, unknown>;
  }) => input)
  .handler(async ({ data }): Promise<ProviderInfo> => {
    await requireUser();
    const { createProvider: create } = await import('~/server/services/provider-service');

    const provider = await create({
      namespaceId: data.namespaceId,
      type: data.type,
      alias: data.alias,
      config: data.config ?? {},
    });

    return {
      id: provider.id,
      namespaceId: provider.namespaceId,
      type: provider.type,
      alias: provider.alias,
      config: provider.config as { [x: string]: {} },
    };
  });

/**
 * Update a provider
 */
export const updateProvider = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    providerId: string;
    type?: string;
    alias?: string;
    config?: Record<string, unknown>;
  }) => input)
  .handler(async ({ data }): Promise<ProviderInfo> => {
    const user = await requireUser();
    const { updateProvider: update, hasProviderAccess } = await import('~/server/services/provider-service');

    const hasAccess = await hasProviderAccess(user.id, data.providerId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const provider = await update(data.providerId, {
      type: data.type,
      alias: data.alias,
      config: data.config,
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    return {
      id: provider.id,
      namespaceId: provider.namespaceId,
      type: provider.type,
      alias: provider.alias,
      config: provider.config as { [x: string]: {} },
    };
  });

/**
 * Delete a provider
 */
export const deleteProvider = createServerFn({ method: 'POST' })
  .inputValidator((input: { providerId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { deleteProvider: del, hasProviderAccess } = await import('~/server/services/provider-service');

    const hasAccess = await hasProviderAccess(user.id, data.providerId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    await del(data.providerId);
    return { success: true };
  });
