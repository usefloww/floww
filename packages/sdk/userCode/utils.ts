import { Trigger } from "../common";
import { ProviderMetadata } from "./providers";

export function getMatchingTriggers(
  triggers: Trigger[],
  triggerMetadata: ProviderMetadata
): Trigger[] {
  const normalizeInput = (input: any) => {
    const normalized: any = {};
    Object.keys(input)
      .sort()
      .forEach((key) => {
        if (input[key] !== undefined) {
          normalized[key] = input[key];
        }
      });
    return normalized;
  };

  // Provider-aware trigger matching
  // Match triggers by provider metadata (type, alias, trigger_type, input)
  const matchingTriggers = triggers.filter((t: any) => {
    // Skip triggers without provider metadata
    if (!t._providerMeta) {
      return false;
    }

    // Match on provider type, alias, trigger type, and input parameters
    const typeMatch = t._providerMeta.type === triggerMetadata.type;
    const aliasMatch = t._providerMeta.alias === triggerMetadata.alias;
    const triggerTypeMatch =
      t._providerMeta.triggerType === triggerMetadata.triggerType;

    // Deep equality check for input parameters (order-independent)
    const registeredInput = normalizeInput(t._providerMeta.input);
    const eventInput = normalizeInput(triggerMetadata.input);
    const inputMatch =
      JSON.stringify(registeredInput) === JSON.stringify(eventInput);

    return typeMatch && aliasMatch && triggerTypeMatch && inputMatch;
  });

  return matchingTriggers;
}
