/**
 * Provider Service
 *
 * Handles provider CRUD operations with encrypted configuration.
 * Providers represent third-party integrations (Slack, Google, etc.)
 */

import { eq, and, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '~/server/db';
import {
  providers,
  incomingWebhooks,
  namespaces,
  organizationMembers,
  type IncomingWebhook,
} from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { encryptSecret, decryptSecret } from '~/server/utils/encryption';
import {
  getProviderDefinition,
  getAllProviderDefinitions,
  getProviderTypes,
  type SetupStep,
} from 'floww/providers/server';
import { INTERNAL_PROVIDERS } from 'floww/providers/constants';
import { settings } from '~/server/settings';

export interface ProviderInfo {
  id: string;
  namespaceId: string;
  type: string;
  alias: string;
  config: Record<string, unknown>;
}

export interface ProviderCreateParams {
  namespaceId: string;
  type: string;
  alias: string;
  config: Record<string, unknown>;
}

export interface ProviderUpdateParams {
  type?: string;
  alias?: string;
  config?: Record<string, unknown>;
}

/**
 * Get a provider by ID and decrypt its configuration
 */
export async function getProvider(providerId: string): Promise<ProviderInfo | null> {
  const db = getDb();

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1);

  if (!provider) {
    return null;
  }

  return {
    id: provider.id,
    namespaceId: provider.namespaceId,
    type: provider.type,
    alias: provider.alias,
    config: JSON.parse(decryptSecret(provider.encryptedConfig)),
  };
}

/**
 * List providers accessible to a user
 */
export async function listProviders(
  userId: string,
  options: {
    namespaceId?: string;
    includeInternal?: boolean;
  } = {}
): Promise<ProviderInfo[]> {
  const db = getDb();
  const { namespaceId, includeInternal = false } = options;

  const conditions = [
    inArray(
      providers.namespaceId,
      db
        .select({ id: namespaces.id })
        .from(namespaces)
        .innerJoin(
          organizationMembers,
          eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
        )
        .where(eq(organizationMembers.userId, userId))
    ),
  ];

  if (namespaceId) {
    conditions.push(eq(providers.namespaceId, namespaceId));
  }

  // Filter out internal providers unless explicitly requested
  if (!includeInternal) {
    conditions.push(notInArray(providers.type, INTERNAL_PROVIDERS as unknown as string[]));
  }

  const result = await db
    .select()
    .from(providers)
    .where(and(...conditions));

  return result.map((provider) => ({
    id: provider.id,
    namespaceId: provider.namespaceId,
    type: provider.type,
    alias: provider.alias,
    config: JSON.parse(decryptSecret(provider.encryptedConfig)),
  }));
}

/**
 * Create a new provider with encrypted configuration
 */
export async function createProvider(
  params: ProviderCreateParams
): Promise<ProviderInfo> {
  const db = getDb();
  const config = { ...params.config };

  const providerId = generateUlidUuid();

  // For Slack providers, create a webhook
  if (params.type === 'slack') {
    const publicApiUrl = settings.general.PUBLIC_API_URL ?? 'http://localhost:3000';
    
    // Generate webhook path if not provided
    if (!config.webhook_url) {
      const webhookPath = `/webhook/${generateUlidUuid()}`;
      config.webhook_url = `${publicApiUrl}${webhookPath}`;
    }

    // Validate webhook URL format
    const webhookUrl = config.webhook_url as string;
    if (!webhookUrl.startsWith(publicApiUrl)) {
      throw new Error('Invalid webhook URL: must use the provided domain');
    }

    const webhookPath = webhookUrl.replace(publicApiUrl, '');

    // Create provider
    const [provider] = await db
      .insert(providers)
      .values({
        id: providerId,
        namespaceId: params.namespaceId,
        type: params.type,
        alias: params.alias,
        encryptedConfig: encryptSecret(JSON.stringify(config)),
      })
      .returning();

    // Create provider-owned webhook
    await db.insert(incomingWebhooks).values({
      id: generateUlidUuid(),
      providerId: provider.id,
      triggerId: null,
      path: webhookPath,
      method: 'POST',
    });

    return {
      id: provider.id,
      namespaceId: provider.namespaceId,
      type: provider.type,
      alias: provider.alias,
      config,
    };
  }

  // For non-Slack providers
  const [provider] = await db
    .insert(providers)
    .values({
      id: providerId,
      namespaceId: params.namespaceId,
      type: params.type,
      alias: params.alias,
      encryptedConfig: encryptSecret(JSON.stringify(config)),
    })
    .returning();

  return {
    id: provider.id,
    namespaceId: provider.namespaceId,
    type: provider.type,
    alias: provider.alias,
    config,
  };
}

/**
 * Update a provider
 */
export async function updateProvider(
  providerId: string,
  updates: ProviderUpdateParams
): Promise<ProviderInfo | null> {
  const db = getDb();

  const updateData: Record<string, unknown> = {};
  if (updates.type !== undefined) {
    updateData.type = updates.type;
  }
  if (updates.alias !== undefined) {
    updateData.alias = updates.alias;
  }
  if (updates.config !== undefined) {
    updateData.encryptedConfig = encryptSecret(JSON.stringify(updates.config));
  }

  if (Object.keys(updateData).length === 0) {
    // No updates, return current state
    return getProvider(providerId);
  }

  const [provider] = await db
    .update(providers)
    .set(updateData)
    .where(eq(providers.id, providerId))
    .returning();

  if (!provider) {
    return null;
  }

  return {
    id: provider.id,
    namespaceId: provider.namespaceId,
    type: provider.type,
    alias: provider.alias,
    config: JSON.parse(decryptSecret(provider.encryptedConfig)),
  };
}

/**
 * Delete a provider
 */
export async function deleteProvider(providerId: string): Promise<boolean> {
  const db = getDb();

  await db.delete(providers).where(eq(providers.id, providerId));

  return true;
}

/**
 * Get the webhook associated with a provider (if any)
 */
export async function getProviderWebhook(providerId: string): Promise<IncomingWebhook | null> {
  const db = getDb();

  const [webhook] = await db
    .select()
    .from(incomingWebhooks)
    .where(eq(incomingWebhooks.providerId, providerId))
    .limit(1);

  return webhook ?? null;
}

/**
 * Check if a user has access to a provider
 */
export async function hasProviderAccess(userId: string, providerId: string): Promise<boolean> {
  const db = getDb();

  const result = await db
    .select({ id: providers.id })
    .from(providers)
    .innerJoin(namespaces, eq(providers.namespaceId, namespaces.id))
    .innerJoin(
      organizationMembers,
      eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
    )
    .where(and(eq(providers.id, providerId), eq(organizationMembers.userId, userId)))
    .limit(1);

  return result.length > 0;
}

// ============================================================================
// SDK Provider Definition Functions
// ============================================================================

export interface ProviderTypeInfo {
  type: string;
  setupSteps: SetupStep[];
  hasTriggers: boolean;
  triggerTypes: string[];
}

/**
 * Get setup steps for a provider type from the SDK
 */
export function getProviderSetupSteps(providerType: string): SetupStep[] {
  const providerDef = getProviderDefinition(providerType);
  return providerDef?.setupSteps ?? [];
}

/**
 * Get information about all available provider types
 */
export function getAvailableProviderTypes(includeInternal = false): ProviderTypeInfo[] {
  const allDefs = getAllProviderDefinitions();

  return Object.entries(allDefs)
    .filter(([type]) => includeInternal || !INTERNAL_PROVIDERS.includes(type as any))
    .map(([type, def]) => ({
      type,
      setupSteps: def.setupSteps,
      hasTriggers: Object.keys(def.triggerDefinitions).length > 0,
      triggerTypes: Object.keys(def.triggerDefinitions),
    }));
}

/**
 * Get list of provider type names
 */
export function getProviderTypeList(): string[] {
  return getProviderTypes();
}

/**
 * Check if a provider type requires setup (has non-empty setup steps)
 */
export function providerRequiresSetup(providerType: string): boolean {
  const steps = getProviderSetupSteps(providerType);
  return steps.some((step) => step.type !== 'webhook' && 
    ((step.type === 'value' || step.type === 'secret') && step.required));
}
