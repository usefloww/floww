/**
 * Trigger Service
 *
 * Manages workflow triggers - the events that cause workflows to execute.
 * Supports webhooks, cron schedules, and other trigger types.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '~/server/db';
import {
  triggers,
  providers,
  incomingWebhooks,
  recurringTasks,
  workflowDeployments,
  type Provider,
  type IncomingWebhook,
} from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { encryptSecret, decryptSecret } from '~/server/utils/encryption';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';
import { getProviderDefinition } from 'floww/providers/server';

export interface TriggerInfo {
  id: string;
  workflowId: string;
  providerId: string;
  triggerType: string;
  input: Record<string, unknown>;
  state: Record<string, unknown> | null;
}

export interface TriggerMetadata {
  providerType: string;
  providerAlias: string;
  triggerType: string;
  input: Record<string, unknown>;
}

export interface WebhookInfo {
  id: string;
  url: string;
  path: string;
  method: string;
  providerType: string;
  providerAlias: string;
  triggerType: string;
  triggerId: string;
}

/**
 * Get a trigger by ID
 */
export async function getTrigger(triggerId: string): Promise<TriggerInfo | null> {
  const db = getDb();

  const [trigger] = await db.select().from(triggers).where(eq(triggers.id, triggerId)).limit(1);

  if (!trigger) {
    return null;
  }

  return {
    id: trigger.id,
    workflowId: trigger.workflowId,
    providerId: trigger.providerId,
    triggerType: trigger.triggerType,
    input: trigger.input as Record<string, unknown>,
    state: trigger.state as Record<string, unknown> | null,
  };
}

/**
 * List triggers for a workflow
 */
export async function listTriggers(workflowId: string): Promise<TriggerInfo[]> {
  const db = getDb();

  const result = await db.select().from(triggers).where(eq(triggers.workflowId, workflowId));

  return result.map((t) => ({
    id: t.id,
    workflowId: t.workflowId,
    providerId: t.providerId,
    triggerType: t.triggerType,
    input: t.input as Record<string, unknown>,
    state: t.state as Record<string, unknown> | null,
  }));
}

/**
 * Create a trigger identity key for comparison
 */
function getTriggerIdentity(meta: TriggerMetadata): string {
  return `${meta.providerType}:${meta.providerAlias}:${meta.triggerType}:${JSON.stringify(meta.input, Object.keys(meta.input).sort())}`;
}

/**
 * Ensure a provider exists, auto-creating if it has no setup steps
 */
async function ensureProviderExists(
  namespaceId: string,
  providerType: string,
  providerAlias: string
): Promise<void> {
  const db = getDb();

  // Check if provider already exists
  const [existing] = await db
    .select()
    .from(providers)
    .where(
      and(
        eq(providers.namespaceId, namespaceId),
        eq(providers.type, providerType),
        eq(providers.alias, providerAlias)
      )
    )
    .limit(1);

  if (existing) {
    return;
  }

  // Providers that can be auto-created (no setup required)
  const autoCreateProviders = ['builtin', 'kvstore'];

  if (!autoCreateProviders.includes(providerType)) {
    logger.warn('Provider requires setup and cannot be auto-created', { providerType, providerAlias });
    return;
  }

  // Auto-create the provider
  await db.insert(providers).values({
    id: generateUlidUuid(),
    namespaceId,
    type: providerType,
    alias: providerAlias,
    encryptedConfig: encryptSecret('{}'),
  });

  logger.info('Auto-created provider', { providerType, providerAlias });
}

/**
 * Get provider by type and alias
 */
async function getProviderByTypeAlias(
  namespaceId: string,
  providerType: string,
  providerAlias: string
): Promise<Provider | null> {
  const db = getDb();

  const [provider] = await db
    .select()
    .from(providers)
    .where(
      and(
        eq(providers.namespaceId, namespaceId),
        eq(providers.type, providerType),
        eq(providers.alias, providerAlias)
      )
    )
    .limit(1);

  return provider ?? null;
}

/**
 * Get provider secrets for SDK lifecycle
 */
async function getProviderSecrets(providerId: string): Promise<Record<string, string>> {
  const db = getDb();

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1);

  if (!provider) {
    return {};
  }

  try {
    const decrypted = decryptSecret(provider.encryptedConfig);
    return JSON.parse(decrypted);
  } catch {
    return {};
  }
}

/**
 * Execute SDK lifecycle.create for a trigger
 */
async function executeTriggerLifecycleCreate(params: {
  providerId: string;
  providerType: string;
  triggerType: string;
  triggerId: string;
  input: Record<string, unknown>;
  webhookUrl: string;
}): Promise<Record<string, unknown>> {
  const providerDef = getProviderDefinition(params.providerType);

  if (!providerDef) {
    logger.debug('No SDK provider definition found, skipping lifecycle', {
      providerType: params.providerType,
    });
    return {};
  }

  const triggerDef = providerDef.triggerDefinitions[params.triggerType];
  if (!triggerDef) {
    logger.debug('No SDK trigger definition found, skipping lifecycle', {
      providerType: params.providerType,
      triggerType: params.triggerType,
    });
    return {};
  }

  const secrets = await getProviderSecrets(params.providerId);

  try {
    const state = await triggerDef.lifecycle.create({
      input: params.input,
      webhookUrl: params.webhookUrl,
      providerId: params.providerId,
      triggerId: params.triggerId,
      secrets,
    });

    logger.info('SDK trigger lifecycle.create executed', {
      providerType: params.providerType,
      triggerType: params.triggerType,
      triggerId: params.triggerId,
    });

    return state as Record<string, unknown>;
  } catch (error) {
    logger.error('SDK trigger lifecycle.create failed', {
      providerType: params.providerType,
      triggerType: params.triggerType,
      triggerId: params.triggerId,
      error: String(error),
    });
    throw error;
  }
}

/**
 * Execute SDK lifecycle.destroy for a trigger
 */
async function executeTriggerLifecycleDestroy(params: {
  providerId: string;
  providerType: string;
  triggerType: string;
  triggerId: string;
  input: Record<string, unknown>;
  state: Record<string, unknown>;
}): Promise<void> {
  const providerDef = getProviderDefinition(params.providerType);

  if (!providerDef) {
    return;
  }

  const triggerDef = providerDef.triggerDefinitions[params.triggerType];
  if (!triggerDef) {
    return;
  }

  const secrets = await getProviderSecrets(params.providerId);

  try {
    await triggerDef.lifecycle.destroy({
      input: params.input,
      state: params.state,
      providerId: params.providerId,
      triggerId: params.triggerId,
      secrets,
    });

    logger.info('SDK trigger lifecycle.destroy executed', {
      providerType: params.providerType,
      triggerType: params.triggerType,
      triggerId: params.triggerId,
    });
  } catch (error) {
    logger.error('SDK trigger lifecycle.destroy failed', {
      providerType: params.providerType,
      triggerType: params.triggerType,
      triggerId: params.triggerId,
      error: String(error),
    });
    // Don't throw - cleanup should be best-effort
  }
}

/**
 * Create a new trigger
 */
export async function createTrigger(params: {
  workflowId: string;
  providerId: string;
  triggerType: string;
  input: Record<string, unknown>;
  state?: Record<string, unknown>;
}): Promise<TriggerInfo> {
  const db = getDb();

  const [trigger] = await db
    .insert(triggers)
    .values({
      id: generateUlidUuid(),
      workflowId: params.workflowId,
      providerId: params.providerId,
      triggerType: params.triggerType,
      input: params.input,
      state: params.state ?? {},
    })
    .returning();

  return {
    id: trigger.id,
    workflowId: trigger.workflowId,
    providerId: trigger.providerId,
    triggerType: trigger.triggerType,
    input: trigger.input as Record<string, unknown>,
    state: trigger.state as Record<string, unknown> | null,
  };
}

/**
 * Update a trigger's state
 */
export async function updateTriggerState(
  triggerId: string,
  state: Record<string, unknown>
): Promise<TriggerInfo | null> {
  const db = getDb();

  const [trigger] = await db
    .update(triggers)
    .set({ state })
    .where(eq(triggers.id, triggerId))
    .returning();

  if (!trigger) {
    return null;
  }

  return {
    id: trigger.id,
    workflowId: trigger.workflowId,
    providerId: trigger.providerId,
    triggerType: trigger.triggerType,
    input: trigger.input as Record<string, unknown>,
    state: trigger.state as Record<string, unknown> | null,
  };
}

/**
 * Delete a trigger
 */
export async function deleteTrigger(triggerId: string): Promise<boolean> {
  const db = getDb();

  // Get trigger details for lifecycle cleanup
  const [trigger] = await db
    .select()
    .from(triggers)
    .where(eq(triggers.id, triggerId))
    .limit(1);

  if (trigger) {
    // Get provider details
    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, trigger.providerId))
      .limit(1);

    if (provider) {
      // Execute SDK lifecycle.destroy
      await executeTriggerLifecycleDestroy({
        providerId: trigger.providerId,
        providerType: provider.type,
        triggerType: trigger.triggerType,
        triggerId,
        input: trigger.input as Record<string, unknown>,
        state: (trigger.state as Record<string, unknown>) ?? {},
      });
    }
  }

  await db.delete(triggers).where(eq(triggers.id, triggerId));

  return true;
}

/**
 * Get deployed trigger identities for a workflow
 * These triggers should be preserved and not removed during dev sync
 */
async function getDeployedTriggerIdentities(workflowId: string): Promise<Set<string>> {
  const db = getDb();

  // Find active deployment
  const [deployment] = await db
    .select()
    .from(workflowDeployments)
    .where(
      and(eq(workflowDeployments.workflowId, workflowId), eq(workflowDeployments.status, 'ACTIVE'))
    )
    .orderBy(desc(workflowDeployments.deployedAt))
    .limit(1);

  if (!deployment || !deployment.triggerDefinitions) {
    return new Set();
  }

  const triggerDefs = deployment.triggerDefinitions as Array<{
    provider: { type: string; alias: string };
    triggerType: string;
    input?: Record<string, unknown>;
  }>;

  const identities = new Set<string>();
  for (const def of triggerDefs) {
    const identity = getTriggerIdentity({
      providerType: def.provider.type,
      providerAlias: def.provider.alias,
      triggerType: def.triggerType,
      input: def.input ?? {},
    });
    identities.add(identity);
  }

  return identities;
}

/**
 * Sync triggers for a workflow.
 * Returns list of webhook info for created/existing webhooks.
 *
 * @param providerMappings - Optional ID-based provider mappings from floww.yaml.
 *   When provided, providers are resolved by ID instead of type:alias lookup.
 *   Structure: { [providerType]: { [codeAlias]: providerUUID } }
 */
export async function syncTriggers(
  workflowId: string,
  namespaceId: string,
  newTriggersMetadata: TriggerMetadata[],
  providerMappings?: Record<string, Record<string, string>>,
): Promise<WebhookInfo[]> {
  const db = getDb();
  const publicApiUrl = settings.general.PUBLIC_API_URL ?? 'http://localhost:3000';
  const hasMapping = providerMappings && Object.keys(providerMappings).length > 0;

  // Ensure builtin provider exists
  await ensureProviderExists(namespaceId, 'builtin', 'default');

  // Filter valid triggers
  const newTriggers = newTriggersMetadata.filter(
    (t) => t.providerType && t.providerAlias
  );

  // Auto-create providers with no setup steps (only when no mapping provided)
  if (!hasMapping) {
    const uniqueProviders = new Set(newTriggers.map((t) => `${t.providerType}:${t.providerAlias}`));
    for (const providerKey of uniqueProviders) {
      const [providerType, providerAlias] = providerKey.split(':');
      await ensureProviderExists(namespaceId, providerType, providerAlias);
    }
  }

  // Load existing triggers
  const existingTriggers = await listTriggers(workflowId);

  // Build identity maps
  const existingMap = new Map<string, TriggerInfo>();
  for (const trigger of existingTriggers) {
    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, trigger.providerId))
      .limit(1);

    if (provider) {
      const identity = getTriggerIdentity({
        providerType: provider.type,
        providerAlias: provider.alias,
        triggerType: trigger.triggerType,
        input: trigger.input,
      });
      existingMap.set(identity, trigger);
    }
  }

  const newMap = new Map<string, TriggerMetadata>();
  for (const meta of newTriggers) {
    const identity = getTriggerIdentity(meta);
    newMap.set(identity, meta);
  }

  // Get deployed trigger identities to preserve
  const deployedIdentities = await getDeployedTriggerIdentities(workflowId);

  // Compute sets
  const existingIdentities = new Set(existingMap.keys());
  const newIdentities = new Set(newMap.keys());

  // to_remove = (existing - new) - deployed
  const toRemove = new Set<string>();
  for (const id of existingIdentities) {
    if (!newIdentities.has(id) && !deployedIdentities.has(id)) {
      toRemove.add(id);
    }
  }

  // to_add = new - existing
  const toAdd = new Set<string>();
  for (const id of newIdentities) {
    if (!existingIdentities.has(id)) {
      toAdd.add(id);
    }
  }

  // to_keep = existing & new
  const toKeep = new Set<string>();
  for (const id of existingIdentities) {
    if (newIdentities.has(id)) {
      toKeep.add(id);
    }
  }

  logger.info('Trigger sync plan', {
    workflowId,
    toRemove: toRemove.size,
    toAdd: toAdd.size,
    toKeep: toKeep.size,
    deployedProtected: deployedIdentities.size,
  });

  // Remove triggers
  for (const identity of toRemove) {
    const trigger = existingMap.get(identity);
    if (trigger) {
      await deleteTrigger(trigger.id);
    }
  }

  // Add triggers
  const errors: Array<{ providerType: string; triggerType: string; error: string }> = [];
  for (const identity of toAdd) {
    const meta = newMap.get(identity)!;
    try {
      // Resolve provider: use ID-based mapping if available, fall back to type:alias lookup
      let providerId: string;
      if (hasMapping) {
        const mappedId = providerMappings![meta.providerType]?.[meta.providerAlias];
        if (!mappedId) {
          throw new Error(
            `No provider mapping found for ${meta.providerType}:${meta.providerAlias} in floww.yaml`
          );
        }
        // Verify the provider exists
        const [providerRecord] = await db
          .select()
          .from(providers)
          .where(eq(providers.id, mappedId))
          .limit(1);
        if (!providerRecord) {
          throw new Error(
            `Provider ID ${mappedId} (mapped from ${meta.providerType}:${meta.providerAlias}) not found`
          );
        }
        providerId = mappedId;
      } else {
        const provider = await getProviderByTypeAlias(namespaceId, meta.providerType, meta.providerAlias);
        if (!provider) {
          throw new Error(`Provider ${meta.providerType}:${meta.providerAlias} not found`);
        }
        providerId = provider.id;
      }

      // Create trigger record
      const trigger = await createTrigger({
        workflowId,
        providerId,
        triggerType: meta.triggerType,
        input: meta.input,
      });

      // Generate webhook URL for this trigger
      const webhookPath = `/webhook/${generateUlidUuid()}`;
      const webhookUrl = `${publicApiUrl}${webhookPath}`;

      // For webhook-based triggers, create incoming webhook
      const isWebhookTrigger = 
        meta.triggerType === 'webhook' || 
        meta.triggerType === 'onWebhook' ||
        meta.triggerType.startsWith('on'); // Most provider triggers are webhook-based

      if (isWebhookTrigger && meta.providerType !== 'builtin') {
        // For provider triggers, we may need external webhook setup
        await db.insert(incomingWebhooks).values({
          id: generateUlidUuid(),
          triggerId: trigger.id,
          providerId: null,
          path: webhookPath,
          method: 'POST',
        });
      } else if (meta.triggerType === 'webhook' || meta.triggerType === 'onWebhook') {
        // For builtin webhooks
        await db.insert(incomingWebhooks).values({
          id: generateUlidUuid(),
          triggerId: trigger.id,
          providerId: null,
          path: webhookPath,
          method: 'POST',
        });
      }

      // For cron triggers, create recurring task
      if (meta.triggerType === 'cron' || meta.triggerType === 'onCron' || meta.triggerType === 'onSchedule') {
        await db.insert(recurringTasks).values({
          id: generateUlidUuid(),
          triggerId: trigger.id,
        });
      }

      // Execute SDK lifecycle.create to set up external resources (webhooks, etc.)
      try {
        const state = await executeTriggerLifecycleCreate({
          providerId,
          providerType: meta.providerType,
          triggerType: meta.triggerType,
          triggerId: trigger.id,
          input: meta.input,
          webhookUrl,
        });

        // Update trigger with state from lifecycle
        if (Object.keys(state).length > 0) {
          await updateTriggerState(trigger.id, state);
        }
      } catch (lifecycleError) {
        logger.warn('SDK lifecycle.create failed, trigger created without external resources', {
          triggerId: trigger.id,
          error: String(lifecycleError),
        });
        // Don't fail the whole sync - the trigger is created, just without external webhook
      }
    } catch (error) {
      errors.push({
        providerType: meta.providerType,
        triggerType: meta.triggerType,
        error: String(error),
      });
      logger.error('Failed to create trigger', { meta, error: String(error) });
    }
  }

  // Collect webhook info
  const webhooksInfo: WebhookInfo[] = [];
  const seenIds = new Set<string>();

  // Get all current triggers
  const allCurrentTriggers = await listTriggers(workflowId);

  for (const trigger of allCurrentTriggers) {
    // Get webhook for this trigger
    const [webhook] = await db
      .select()
      .from(incomingWebhooks)
      .where(eq(incomingWebhooks.triggerId, trigger.id))
      .limit(1);

    if (webhook && !seenIds.has(webhook.id)) {
      const [provider] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, trigger.providerId))
        .limit(1);

      if (provider) {
        webhooksInfo.push({
          id: webhook.id,
          url: `${publicApiUrl}${webhook.path}`,
          path: webhook.path,
          method: webhook.method,
          providerType: provider.type,
          providerAlias: provider.alias,
          triggerType: trigger.triggerType,
          triggerId: trigger.id,
        });
        seenIds.add(webhook.id);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      JSON.stringify({
        message: 'Failed to create one or more triggers',
        failedTriggers: errors,
      })
    );
  }

  return webhooksInfo;
}

/**
 * Get webhook for a trigger
 */
export async function getTriggerWebhook(triggerId: string): Promise<IncomingWebhook | null> {
  const db = getDb();

  const [webhook] = await db
    .select()
    .from(incomingWebhooks)
    .where(eq(incomingWebhooks.triggerId, triggerId))
    .limit(1);

  return webhook ?? null;
}

/**
 * Get trigger by webhook path
 */
export async function getTriggerByWebhookPath(path: string): Promise<TriggerInfo | null> {
  const db = getDb();

  const result = await db
    .select({ trigger: triggers })
    .from(incomingWebhooks)
    .innerJoin(triggers, eq(incomingWebhooks.triggerId, triggers.id))
    .where(eq(incomingWebhooks.path, path))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const { trigger } = result[0];
  return {
    id: trigger.id,
    workflowId: trigger.workflowId,
    providerId: trigger.providerId,
    triggerType: trigger.triggerType,
    input: trigger.input as Record<string, unknown>,
    state: trigger.state as Record<string, unknown> | null,
  };
}
