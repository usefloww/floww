import { tool } from 'ai';
import { z } from 'zod';
import type { MessagePart, SecretSetupData, AgentContext } from '../context';

export function createCheckSecretsTool(context: AgentContext) {
  return tool({
    description:
      'Check if required secrets are configured for this namespace. ' +
      'Use this after checking providers to ensure all necessary secrets are available. ' +
      'Pass an empty array to just list existing secrets.',
    inputSchema: z.object({
      secrets: z
        .array(z.string())
        .describe('List of secret names to check (e.g., ["my-api-key", "webhook-token"])'),
    }),
    execute: async ({ secrets: requestedSecrets }) => {
      const configuredNames = new Set(context.configuredSecrets.map((s) => s.name));
      const parts: MessagePart[] = [];

      const missing: string[] = [];
      const found: string[] = [];

      for (const name of requestedSecrets) {
        if (configuredNames.has(name)) {
          found.push(name);
        } else {
          missing.push(name);
        }
      }

      for (const name of missing) {
        const setupData: SecretSetupData = {
          secretName: name,
          secretType: 'custom',
          configured: false,
          message: `Secret "${name}" needs to be configured before we can proceed.`,
        };
        parts.push({
          type: 'data-secret-setup',
          data: setupData,
        });
      }

      if (missing.length > 0) {
        parts.unshift({
          type: 'text',
          text: `The following secrets need to be configured before we can proceed: ${missing.join(', ')}. Please set them up and then continue.`,
        });

        return {
          isTerminal: true,
          parts,
        };
      }

      const configuredList =
        context.configuredSecrets.length > 0
          ? context.configuredSecrets.map((s) => s.name).join(', ')
          : 'none';

      const resultMessage =
        requestedSecrets.length > 0
          ? `All required secrets (${found.join(', ')}) are configured. Currently configured secrets: ${configuredList}.`
          : `Currently configured secrets: ${configuredList}.`;

      return {
        isTerminal: false,
        parts: [{ type: 'text', text: resultMessage }],
      };
    },
  });
}
