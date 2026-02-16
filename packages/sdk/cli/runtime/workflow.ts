import { ProjectConfig, ProviderMappings } from "../config/projectConfig";
import { fetchWorkflow, fetchProviders, fetchProviderById } from "../api/apiMethods";
import { logger } from "../utils/logger";
import { SecretManager } from "../secrets/secretManager";
import { defaultApiClient } from "../api/client";

export interface WorkflowConfig {
  workflowId: string;
  namespaceId: string;
  name: string;
}

export type ProviderConfig = Record<string, any>;

/**
 * Check that workflow exists and resolve namespace.
 *
 * Resolves workflow details and namespace ID from project configuration.
 *
 * @param projectConfig - The loaded floww.yaml configuration
 * @returns Workflow configuration with resolved namespace ID
 * @throws {Error} If workflow ID is missing or workflow not found
 */
export async function resolveWorkflow(
  projectConfig: ProjectConfig,
): Promise<WorkflowConfig> {
  if (!projectConfig.workflowId) {
    throw new Error(
      'No workflowId found in floww.yaml. Run "floww init" to configure your project.',
    );
  }

  try {
    const workflow = await fetchWorkflow(projectConfig.workflowId);

    logger.debugInfo(`Resolved workflow: ${workflow.name}`);
    logger.debugInfo(`Namespace ID: ${workflow.namespace_id}`);

    return {
      workflowId: workflow.id,
      namespaceId: workflow.namespace_id,
      name: workflow.name || workflow.id,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch workflow "${projectConfig.workflowId}": ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Fetch available providers in namespace.
 *
 * Fetches all provider configurations from the backend and prepares them
 * for injection into user code execution context. Also fetches secrets
 * and merges them into provider configs.
 *
 * @param namespaceId - The namespace ID to fetch providers for
 * @returns Map of provider configs keyed by "type:alias"
 * @throws {Error} If provider fetch fails
 */
export async function fetchProviderConfigs(
  namespaceId: string
): Promise<Map<string, ProviderConfig>> {
  try {
    const providers = await fetchProviders();
    const secretManager = new SecretManager(defaultApiClient(), namespaceId);

    const configs = new Map<string, ProviderConfig>();

    for (const provider of providers) {
      const key = `${provider.type}:${provider.alias}`;

      // Fetch secrets for this provider and merge with config
      const secrets = await secretManager.getProviderSecrets(
        provider.type,
        provider.alias
      );

      // Merge config and secrets (secrets take precedence)
      const mergedConfig = { ...provider.config, ...secrets };
      configs.set(key, mergedConfig);

      logger.debugInfo(`Loaded provider config: ${key}`);
    }

    logger.debugInfo(`Total provider configs loaded: ${configs.size}`);

    return configs;
  } catch (error) {
    // Non-fatal: continue without provider configs
    logger.warn(
      `Could not fetch provider configs: ${
        error instanceof Error ? error.message : error
      }`
    );
    logger.plain("   Continuing without backend provider configurations");

    return new Map();
  }
}

/**
 * Fetch provider configs using the provider ID mapping from floww.yaml.
 *
 * Instead of fetching all providers in a namespace and keying by type:alias,
 * this function resolves each mapping entry by provider ID and keys configs
 * by `type:codeAlias` so user code can look them up by the local alias.
 *
 * @param mappings - Provider mappings from floww.yaml: { [type]: { [codeAlias]: providerID } }
 * @param namespaceId - The namespace ID (for secret fetching)
 * @returns Map of provider configs keyed by "type:codeAlias"
 */
export async function fetchProviderConfigsByMapping(
  mappings: ProviderMappings,
  namespaceId: string
): Promise<Map<string, ProviderConfig>> {
  try {
    const secretManager = new SecretManager(defaultApiClient(), namespaceId);
    const configs = new Map<string, ProviderConfig>();

    for (const [providerType, aliasMap] of Object.entries(mappings)) {
      for (const [codeAlias, providerId] of Object.entries(aliasMap)) {
        try {
          const provider = await fetchProviderById(providerId);
          const key = `${providerType}:${codeAlias}`;

          // Fetch secrets for this provider and merge with config
          const secrets = await secretManager.getProviderSecrets(
            provider.type,
            provider.alias
          );

          // Merge config and secrets (secrets take precedence)
          const mergedConfig = { ...provider.config, ...secrets };
          configs.set(key, mergedConfig);

          logger.debugInfo(`Loaded provider config (by ID mapping): ${key} -> ${providerId}`);
        } catch (error) {
          logger.warn(
            `Could not fetch provider ${providerType}:${codeAlias} (ID: ${providerId}): ${
              error instanceof Error ? error.message : error
            }`
          );
        }
      }
    }

    logger.debugInfo(`Total provider configs loaded via mapping: ${configs.size}`);
    return configs;
  } catch (error) {
    logger.warn(
      `Could not fetch provider configs by mapping: ${
        error instanceof Error ? error.message : error
      }`
    );
    logger.plain("   Continuing without backend provider configurations");
    return new Map();
  }
}
