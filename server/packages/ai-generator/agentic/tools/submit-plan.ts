/**
 * Submit Plan Tool
 *
 * Submits a workflow plan for user approval before generating code.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { MessagePart, Plan, SecretSetupData, AgentContext } from '../context';

const PlanTriggerSchema = z.object({
  type: z.string().describe('Type of trigger (webhook, cron, manual)'),
  source: z.string().describe('Source of the trigger (e.g., GitHub, Slack)'),
  details: z.string().describe('Detailed description of what triggers the workflow'),
});

const PlanActionSchema = z.object({
  provider: z.string().describe('Provider/service that performs this action'),
  description: z.string().describe('What this action does'),
});

const PlanSchema = z.object({
  summary: z.string().describe('Brief summary of what the workflow does'),
  trigger: PlanTriggerSchema,
  actions: z.array(PlanActionSchema).describe('List of actions the workflow performs'),
  requiredProviders: z.array(z.string()).describe('Providers needed for this workflow'),
  requiredSecrets: z.array(z.string()).describe('Secrets/API keys needed for this workflow'),
});

export function createSubmitPlanTool(context?: AgentContext) {
  return tool({
    description:
      'Submit a detailed workflow plan for user approval before generating code. ' +
      'The plan should include the trigger, actions, required providers, and secrets. ' +
      'This is a terminal tool - wait for user approval before generating code.',
    inputSchema: z.object({
      plan: PlanSchema.describe('The complete workflow plan for user approval'),
    }),
    execute: async ({ plan }) => {
      const planData: Plan = {
        summary: plan.summary,
        trigger: plan.trigger,
        actions: plan.actions,
        requiredProviders: plan.requiredProviders,
        requiredSecrets: plan.requiredSecrets,
      };

      if (context && planData.requiredSecrets.length > 0) {
        const configuredNames = new Set(context.configuredSecrets.map((s) => s.name));
        const missing = planData.requiredSecrets.filter((name) => !configuredNames.has(name));

        if (missing.length > 0) {
          const parts: MessagePart[] = [
            {
              type: 'text',
              text: `The following secrets need to be configured before we can proceed: ${missing.join(', ')}. Please set them up and then continue.`,
            },
          ];

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

          return {
            isTerminal: true,
            parts,
            plan: planData,
          };
        }
      }

      const part: MessagePart = {
        type: 'data-plan-confirmation',
        data: { plan: planData, awaiting_approval: true },
      };

      return {
        isTerminal: true,
        parts: [part],
        plan: planData,
      };
    },
  });
}
