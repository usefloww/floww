import { fetchProviders, Provider } from "../api/apiMethods";
import { logger } from "../utils/logger";

export interface UsedProvider {
  type: string;
  alias?: string;
}

export interface ProviderAvailabilityResult {
  available: UsedProvider[];
  unavailable: UsedProvider[];
  existingProviders: Provider[];
}

export async function checkProviderAvailability(
  usedProviders: UsedProvider[],
): Promise<ProviderAvailabilityResult> {
  try {
    // Fetch existing providers from API
    const existingProviders = await fetchProviders();

    // Create a map of existing providers by type:alias
    const existingMap = new Map<string, Provider>();
    existingProviders.forEach((provider) => {
      const key = `${provider.type}:${provider.alias}`;
      existingMap.set(key, provider);
    });

    const available: UsedProvider[] = [];
    const unavailable: UsedProvider[] = [];

    // Check each used provider
    usedProviders.forEach((used) => {
      const key = `${used.type}:${used.alias || "default"}`;

      if (used.type == "builtin") {
        available.push(used);
      } else if (existingMap.has(key)) {
        available.push(used);
      } else {
        unavailable.push(used);
      }
    });

    return {
      available,
      unavailable,
      existingProviders,
    };
  } catch (error) {
    logger.error("Failed to check provider availability", error);
    throw error;
  }
}

export function getUnavailableProviderTypes(
  unavailable: UsedProvider[],
): string[] {
  return [...new Set(unavailable.map((p) => p.type))];
}
