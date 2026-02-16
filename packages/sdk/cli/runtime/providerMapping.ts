import {
  ProviderMappings,
  loadProjectConfig,
  updateProjectConfig,
} from "../config/projectConfig";
import { fetchProviders, type Provider } from "../api/apiMethods";
import { logger } from "../utils/logger";

/**
 * Used provider info as detected from user code execution.
 */
export interface UsedProviderInfo {
  type: string;
  alias?: string;
}

/**
 * Auto-populate provider mappings in floww.yaml based on used providers.
 *
 * For each used provider (detected from user code), this function:
 * 1. Checks if a mapping already exists in floww.yaml
 * 2. If not, looks up existing providers by type:alias in the namespace
 * 3. If found, auto-creates the mapping entry: type.codeAlias -> provider.id
 * 4. Saves updated mappings back to floww.yaml
 *
 * @param usedProviders - Providers detected from user code execution
 * @param projectDir - Directory containing floww.yaml
 * @returns The final provider mappings (existing + newly created)
 */
export async function autoPopulateProviderMappings(
  usedProviders: UsedProviderInfo[],
  projectDir?: string,
): Promise<ProviderMappings> {
  if (usedProviders.length === 0) {
    return {};
  }

  // Load current config to get existing mappings
  const projectConfig = loadProjectConfig(projectDir);
  const existingMappings: ProviderMappings = projectConfig.providers ?? {};

  // Find providers that are missing from the mapping
  const missingProviders: Array<{ type: string; alias: string }> = [];
  for (const used of usedProviders) {
    const alias = used.alias || "default";
    const typeMap = existingMappings[used.type];
    if (!typeMap || !typeMap[alias]) {
      missingProviders.push({ type: used.type, alias });
    }
  }

  if (missingProviders.length === 0) {
    logger.debugInfo("All used providers have mappings in floww.yaml");
    return existingMappings;
  }

  // Fetch existing providers from the API to match by type:alias
  let existingProvidersList: Provider[];
  try {
    existingProvidersList = await fetchProviders();
  } catch (error) {
    logger.warn(
      `Could not fetch providers to auto-populate mappings: ${
        error instanceof Error ? error.message : error
      }`
    );
    return existingMappings;
  }

  // Build a lookup map by type:alias
  const providerLookup = new Map<string, Provider>();
  for (const provider of existingProvidersList) {
    const key = `${provider.type}:${provider.alias}`;
    providerLookup.set(key, provider);
  }

  // Auto-populate missing mappings
  const updatedMappings: ProviderMappings = { ...existingMappings };
  let newMappingsCount = 0;

  for (const missing of missingProviders) {
    const lookupKey = `${missing.type}:${missing.alias}`;
    const matchedProvider = providerLookup.get(lookupKey);

    if (matchedProvider) {
      // Found a matching provider by type:alias - create the mapping
      if (!updatedMappings[missing.type]) {
        updatedMappings[missing.type] = {};
      }
      updatedMappings[missing.type][missing.alias] = matchedProvider.id;
      newMappingsCount++;

      logger.debugInfo(
        `Auto-mapped ${missing.type}:${missing.alias} -> ${matchedProvider.id}`
      );
    } else {
      logger.debugInfo(
        `No existing provider found for ${missing.type}:${missing.alias} - will be created during provider setup`
      );
    }
  }

  // Save updated mappings to floww.yaml if any new ones were added
  if (newMappingsCount > 0) {
    updateProjectConfig({ providers: updatedMappings }, projectDir);
    logger.debugInfo(
      `Saved ${newMappingsCount} new provider mapping(s) to floww.yaml`
    );
  }

  return updatedMappings;
}

/**
 * Update provider mappings after new providers are created (e.g., during setup).
 *
 * Called after interactive provider setup to capture newly created providers
 * into the floww.yaml mapping.
 *
 * @param usedProviders - Providers detected from user code
 * @param projectDir - Directory containing floww.yaml
 * @returns Updated provider mappings
 */
export async function refreshProviderMappings(
  usedProviders: UsedProviderInfo[],
  projectDir?: string,
): Promise<ProviderMappings> {
  // Re-run auto-populate to pick up any newly created providers
  return await autoPopulateProviderMappings(usedProviders, projectDir);
}
