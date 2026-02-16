/**
 * Check Providers Tool
 *
 * Validates that required providers are available and configured.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { MessagePart, ProviderSetupData, AgentContext } from '../context';
import { AVAILABLE_PROVIDERS } from '../context';

/**
 * Match user-provided provider names against available providers
 */
function matchProviders(
  requestedProviders: string[],
  configuredProviders: AgentContext['configuredProviders']
): { matched: string[]; unconfigured: string[]; unknown: string[] } {
  const matched: string[] = [];
  const unconfigured: string[] = [];
  const unknown: string[] = [];

  const availableNames = AVAILABLE_PROVIDERS.map((p) => p.name.toLowerCase());
  const configuredNames = new Set(configuredProviders.map((p) => p.name.toLowerCase()));

  for (const requested of requestedProviders) {
    const normalizedName = requested.toLowerCase().trim();

    // Check if it's a known provider
    const isKnown = availableNames.includes(normalizedName);

    if (!isKnown) {
      // Might be a custom integration
      unknown.push(requested);
      continue;
    }

    // Check if it's configured
    if (configuredNames.has(normalizedName)) {
      matched.push(normalizedName);
    } else {
      unconfigured.push(normalizedName);
    }
  }

  return { matched, unconfigured, unknown };
}

export function createCheckProvidersTool(context: AgentContext) {
  return tool({
    description:
      'Check if the required providers/integrations are configured for this namespace. ' +
      'Use this before generating code to ensure all necessary integrations are available. ' +
      'This is NOT a terminal tool - the conversation will continue after checking.',
    inputSchema: z.object({
      providers: z
        .array(z.string())
        .min(1)
        .describe('List of provider names to check (e.g., ["slack", "github"])'),
    }),
    execute: async ({ providers }) => {
      const { matched, unconfigured, unknown } = matchProviders(providers, context.configuredProviders);

      const parts: MessagePart[] = [];

      // Add provider setup prompts for unconfigured providers
      for (const provider of unconfigured) {
        const setupData: ProviderSetupData = {
          provider,
          configured: false,
          setupUrl: `/settings/integrations/${provider}`,
        };
        parts.push({
          type: 'data-provider-setup',
          data: setupData,
        });
      }

      // If there are unconfigured providers, this becomes terminal
      // so the user can set them up
      if (unconfigured.length > 0) {
        parts.unshift({
          type: 'text',
          text: `The following providers need to be configured before we can proceed: ${unconfigured.join(', ')}. Please set them up and then continue.`,
        });

        return {
          isTerminal: true,
          parts,
        };
      }

      // All providers are configured, continue
      const resultMessage =
        unknown.length > 0
          ? `Providers ${matched.join(', ')} are configured. Note: ${unknown.join(', ')} will use custom HTTP integrations via the Secret class.`
          : `All required providers (${matched.join(', ')}) are configured and ready.`;

      return {
        isTerminal: false,
        parts: [{ type: 'text', text: resultMessage }],
      };
    },
  });
}
