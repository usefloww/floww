/**
 * Trigger Execution Service
 *
 * Handles the actual execution of triggers - invoking the runtime with the
 * appropriate payload when a webhook is received or a cron job fires.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '~/server/db';
import {
  triggers,
  providers,
  workflows,
  workflowDeployments,
  runtimes,
} from '~/server/db/schema';
import { decryptSecret } from '~/server/utils/encryption';
import {
  updateExecutionStarted,
  updateExecutionNoDeployment,
} from '~/server/services/execution-service';
import {
  getRuntime,
  type RuntimeConfig,
  type UserCode,
  type RuntimePayload,
} from '~/server/packages/runtimes';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

export interface TriggerPayload {
  trigger: {
    provider: {
      type: string;
      alias: string;
    };
    triggerType: string;
    input: Record<string, unknown>;
  };
  data: Record<string, unknown>;
  backendUrl: string;
  authToken: string;
  executionId: string;
  providerConfigs: Record<string, Record<string, unknown>>;
}

export interface WebhookEventData {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
}

export interface CronEventData {
  scheduledTime: string;
  expression: string;
}

export interface ExecutionResult {
  triggerId: string;
  workflowId: string;
  executionId: string;
  status: 'invoked' | 'skipped' | 'error';
  error?: string;
}

/**
 * Build the trigger payload for V2 format
 */
export function buildTriggerPayload(params: {
  providerType: string;
  providerAlias: string;
  triggerType: string;
  triggerInput: Record<string, unknown>;
  eventData: Record<string, unknown>;
  providerConfigs: Record<string, Record<string, unknown>>;
  authToken: string;
  executionId: string;
}): TriggerPayload {
  const backendUrl = settings.general.PUBLIC_API_URL ?? 'http://localhost:3000';

  return {
    trigger: {
      provider: {
        type: params.providerType,
        alias: params.providerAlias,
      },
      triggerType: params.triggerType,
      input: params.triggerInput,
    },
    data: params.eventData,
    backendUrl,
    authToken: params.authToken,
    executionId: params.executionId,
    providerConfigs: params.providerConfigs,
  };
}

/**
 * Build event data for webhook triggers
 */
export function buildWebhookEventData(params: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
}): WebhookEventData {
  return {
    method: params.method,
    path: params.path,
    headers: params.headers,
    body: params.body,
    query: params.query,
    params: params.query, // Alias for compatibility
  };
}

/**
 * Build event data for cron triggers
 */
export function buildCronEventData(
  cronExpression: string,
  scheduledTime: Date = new Date()
): CronEventData {
  return {
    scheduledTime: scheduledTime.toISOString(),
    expression: cronExpression,
  };
}

/**
 * Get the active deployment for a workflow
 */
async function getActiveDeployment(workflowId: string) {
  const db = getDb();

  const [deployment] = await db
    .select({
      deployment: workflowDeployments,
      runtime: runtimes,
    })
    .from(workflowDeployments)
    .innerJoin(runtimes, eq(workflowDeployments.runtimeId, runtimes.id))
    .where(
      and(eq(workflowDeployments.workflowId, workflowId), eq(workflowDeployments.status, 'ACTIVE'))
    )
    .orderBy(desc(workflowDeployments.deployedAt))
    .limit(1);

  return deployment ?? null;
}

/**
 * Get all provider configs for a namespace (legacy: keyed by type:alias)
 */
async function getProviderConfigs(
  namespaceId: string
): Promise<Record<string, Record<string, unknown>>> {
  const db = getDb();

  const result = await db
    .select()
    .from(providers)
    .where(eq(providers.namespaceId, namespaceId));

  const configs: Record<string, Record<string, unknown>> = {};

  for (const provider of result) {
    const config = JSON.parse(decryptSecret(provider.encryptedConfig));
    const key = `${provider.type}:${provider.alias}`;
    configs[key] = config;
  }

  return configs;
}

/**
 * Get provider configs using ID-based mapping from the deployment.
 * Keys configs by `type:codeAlias` so runtime code can look them up by code alias.
 */
async function getProviderConfigsByMapping(
  providerMappings: Record<string, Record<string, string>>
): Promise<Record<string, Record<string, unknown>>> {
  const db = getDb();
  const configs: Record<string, Record<string, unknown>> = {};

  for (const [providerType, aliasMap] of Object.entries(providerMappings)) {
    for (const [codeAlias, providerId] of Object.entries(aliasMap)) {
      try {
        const [provider] = await db
          .select()
          .from(providers)
          .where(eq(providers.id, providerId))
          .limit(1);

        if (provider) {
          const config = JSON.parse(decryptSecret(provider.encryptedConfig));
          const key = `${providerType}:${codeAlias}`;
          configs[key] = config;
        }
      } catch {
        // Skip providers with invalid config
      }
    }
  }

  return configs;
}

/**
 * Reverse-lookup the code alias for a provider from the deployment's provider mappings.
 * Given mappings like { slack: { marketing: "uuid-123" } } and providerId "uuid-123",
 * returns "marketing".
 */
function resolveCodeAlias(
  providerMappings: Record<string, Record<string, string>>,
  providerType: string,
  providerId: string,
): string | null {
  const aliasMap = providerMappings[providerType];
  if (!aliasMap) return null;

  for (const [codeAlias, mappedId] of Object.entries(aliasMap)) {
    if (mappedId === providerId) {
      return codeAlias;
    }
  }
  return null;
}

/**
 * Generate a short-lived JWT token for workflow invocation
 * This is a simplified implementation - in production, use the workflow-auth-service
 */
function generateInvocationToken(workflowId: string, namespaceId: string): string {
  // Simple token for now - should be replaced with proper JWT
  const payload = {
    workflowId,
    namespaceId,
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    iat: Math.floor(Date.now() / 1000),
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Execute a trigger with the given event data
 * 
 * Flow:
 * 1. Check if workflow is active
 * 2. Find active deployment
 * 3. Generate auth token
 * 4. Get provider configs
 * 5. Build payload
 * 6. Invoke runtime
 */
export async function executeTrigger(
  triggerId: string,
  eventData: Record<string, unknown>,
  executionId: string
): Promise<ExecutionResult> {
  const db = getDb();

  // Load trigger with provider and workflow
  const result = await db
    .select({
      trigger: triggers,
      provider: providers,
      workflow: workflows,
    })
    .from(triggers)
    .innerJoin(providers, eq(triggers.providerId, providers.id))
    .innerJoin(workflows, eq(triggers.workflowId, workflows.id))
    .where(eq(triggers.id, triggerId))
    .limit(1);

  if (result.length === 0) {
    return {
      triggerId,
      workflowId: '',
      executionId,
      status: 'error',
      error: 'Trigger not found',
    };
  }

  const { trigger, provider, workflow } = result[0];

  // Check if workflow is active
  if (workflow.active === false) {
    await updateExecutionNoDeployment(executionId);
    logger.warn('Workflow is inactive, skipping trigger execution', {
      triggerId,
      workflowId: workflow.id,
      executionId,
    });
    return {
      triggerId,
      workflowId: workflow.id,
      executionId,
      status: 'skipped',
    };
  }

  // Find active deployment
  const deploymentResult = await getActiveDeployment(workflow.id);
  if (!deploymentResult) {
    await updateExecutionNoDeployment(executionId);
    logger.debug('No active deployment found for trigger', {
      triggerId,
      workflowId: workflow.id,
      executionId,
    });
    return {
      triggerId,
      workflowId: workflow.id,
      executionId,
      status: 'skipped',
    };
  }

  const { deployment, runtime } = deploymentResult;

  // Update execution: started
  await updateExecutionStarted(executionId, deployment.id);

  // Generate auth token
  const authToken = generateInvocationToken(workflow.id, workflow.namespaceId);

  // Get provider configs: use ID-based mapping if deployment has one, fall back to namespace lookup
  const deploymentMappings = deployment.providerMappings as Record<string, Record<string, string>> | null;
  const hasMapping = deploymentMappings && Object.keys(deploymentMappings).length > 0;
  const providerConfigs = hasMapping
    ? await getProviderConfigsByMapping(deploymentMappings)
    : await getProviderConfigs(workflow.namespaceId);

  // Derive the code alias from the deployment's provider mapping (reverse lookup by provider ID),
  // falling back to the provider's current alias for deployments without mappings.
  const effectiveAlias = hasMapping
    ? resolveCodeAlias(deploymentMappings, provider.type, provider.id) ?? provider.alias
    : provider.alias;

  // Build runtime payload
  const triggerPayload = buildTriggerPayload({
    providerType: provider.type,
    providerAlias: effectiveAlias,
    triggerType: trigger.triggerType,
    triggerInput: trigger.input as Record<string, unknown>,
    eventData,
    providerConfigs,
    authToken,
    executionId,
  });

  // Get runtime config
  const runtimeConfigData = runtime.config as Record<string, unknown> | null;
  const imageUri = runtimeConfigData?.image_uri as string | undefined;
  const imageHash = runtimeConfigData?.image_hash as string | undefined;
  const imageDigest = imageHash ?? imageUri;

  if (!imageDigest) {
    logger.error('Runtime config missing image_uri or image_hash', {
      runtimeId: runtime.id,
      deploymentId: deployment.id,
      executionId,
    });
    return {
      triggerId,
      workflowId: workflow.id,
      executionId,
      status: 'error',
      error: 'Runtime config missing image configuration',
    };
  }

  // Build runtime configuration
  const runtimeConfig: RuntimeConfig = {
    runtimeId: runtime.id,
    imageDigest,
  };

  // Get user code from deployment
  const deploymentUserCode = deployment.userCode as { files?: Record<string, string>; entrypoint?: string } | null;
  const userCode: UserCode = {
    files: deploymentUserCode?.files ?? {},
    entrypoint: deploymentUserCode?.entrypoint ?? 'index.ts',
  };

  // Build runtime payload
  const runtimePayload: RuntimePayload = {
    trigger: triggerPayload.trigger,
    data: triggerPayload.data,
    authToken: triggerPayload.authToken,
    executionId: triggerPayload.executionId,
    providerConfigs: triggerPayload.providerConfigs,
  };

  // Invoke the runtime
  try {
    logger.info('Invoking runtime with payload', {
      triggerId,
      workflowId: workflow.id,
      executionId,
      runtimeId: runtime.id,
      imageDigest,
    });

    await getRuntime().invokeTrigger(triggerId, runtimeConfig, userCode, runtimePayload);
  } catch (error) {
    logger.error('Runtime invocation failed', {
      triggerId,
      workflowId: workflow.id,
      executionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      triggerId,
      workflowId: workflow.id,
      executionId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Runtime invocation failed',
    };
  }

  return {
    triggerId,
    workflowId: workflow.id,
    executionId,
    status: 'invoked',
  };
}

/**
 * Execute a trigger from a webhook request
 */
export async function executeWebhookTrigger(
  triggerId: string,
  webhookData: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: unknown;
    query: Record<string, string>;
  },
  executionId: string
): Promise<ExecutionResult> {
  const eventData = buildWebhookEventData(webhookData);
  return executeTrigger(triggerId, eventData as unknown as Record<string, unknown>, executionId);
}

/**
 * Execute a trigger from a cron schedule
 */
export async function executeCronTrigger(
  triggerId: string,
  cronExpression: string,
  scheduledTime: Date,
  executionId: string
): Promise<ExecutionResult> {
  const eventData = buildCronEventData(cronExpression, scheduledTime);
  return executeTrigger(triggerId, eventData as unknown as Record<string, unknown>, executionId);
}

/**
 * Execute a trigger manually (user-initiated)
 */
export async function executeManualTrigger(
  triggerId: string,
  customData: Record<string, unknown>,
  executionId: string
): Promise<ExecutionResult> {
  const eventData = {
    type: 'manual',
    triggeredAt: new Date().toISOString(),
    ...customData,
  };
  return executeTrigger(triggerId, eventData, executionId);
}
