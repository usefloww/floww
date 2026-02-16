import type { ProviderDefinition } from "../base";

export const KVStoreServerProvider: ProviderDefinition = {
  providerType: "kvstore",
  setupSteps: [], // No config required - just a namespace identifier
  triggerDefinitions: {}, // No triggers
};
