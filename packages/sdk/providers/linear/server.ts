import { z } from "zod";
import type {
  ProviderDefinition,
  TriggerDefinition,
  WebhookProcessor,
  WebhookRequest,
  TriggerInfo,
  WebhookMatch,
  SetupStep,
} from "../base";
import { LinearApi } from "./api";

// ============================================================================
// Provider Secrets Type
// ============================================================================

interface LinearSecrets {
  api_token: string;
}

// ============================================================================
// Setup Steps
// ============================================================================

const setupSteps: SetupStep[] = [
  {
    type: "secret",
    key: "api_token",
    label: "API Token",
    description:
      "Linear API token. Go to Linear Settings > API > Personal API keys to create one.",
    required: true,
    placeholder: "lin_api_xxxxxxxxxxxxxxxxxxxx",
  },
];

// ============================================================================
// Input and State Schemas
// ============================================================================

const OnIssueInputSchema = z.object({
  resourceTypes: z.array(z.string()).optional(),
});

const OnIssueStateSchema = z.object({
  webhookId: z.string(),
});

const OnCommentInputSchema = z.object({
  resourceTypes: z.array(z.string()).optional(),
});

const OnCommentStateSchema = z.object({
  webhookId: z.string(),
});

type OnIssueInput = z.infer<typeof OnIssueInputSchema>;
type OnIssueState = z.infer<typeof OnIssueStateSchema>;
type OnCommentInput = z.infer<typeof OnCommentInputSchema>;
type OnCommentState = z.infer<typeof OnCommentStateSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

function getApi(secrets: LinearSecrets): LinearApi {
  return new LinearApi({ apiToken: secrets.api_token });
}

// ============================================================================
// Trigger Definitions
// ============================================================================

const onIssueTrigger: TriggerDefinition<OnIssueInput, OnIssueState, LinearSecrets> = {
  inputSchema: OnIssueInputSchema,
  stateSchema: OnIssueStateSchema,
  lifecycle: {
    async create(ctx) {
      const api = getApi(ctx.secrets);
      const resourceTypes = ctx.input.resourceTypes ?? ["Issue"];
      const { id } = await api.createWebhook(ctx.webhookUrl, resourceTypes);
      return { webhookId: id };
    },
    async destroy(ctx) {
      const api = getApi(ctx.secrets);
      try {
        await api.deleteWebhook(ctx.state.webhookId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("404") && !message.includes("not found")) {
          throw err;
        }
      }
    },
    async refresh(ctx) {
      const api = getApi(ctx.secrets);
      const webhook = await api.getWebhook(ctx.state.webhookId);
      if (!webhook) {
        throw new Error("Linear webhook no longer exists");
      }
      return ctx.state;
    },
  },
};

const onCommentTrigger: TriggerDefinition<OnCommentInput, OnCommentState, LinearSecrets> = {
  inputSchema: OnCommentInputSchema,
  stateSchema: OnCommentStateSchema,
  lifecycle: {
    async create(ctx) {
      const api = getApi(ctx.secrets);
      const resourceTypes = ctx.input.resourceTypes ?? ["Comment"];
      const { id } = await api.createWebhook(ctx.webhookUrl, resourceTypes);
      return { webhookId: id };
    },
    async destroy(ctx) {
      const api = getApi(ctx.secrets);
      try {
        await api.deleteWebhook(ctx.state.webhookId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("404") && !message.includes("not found")) {
          throw err;
        }
      }
    },
    async refresh(ctx) {
      const api = getApi(ctx.secrets);
      const webhook = await api.getWebhook(ctx.state.webhookId);
      if (!webhook) {
        throw new Error("Linear webhook no longer exists");
      }
      return ctx.state;
    },
  },
};

// ============================================================================
// Webhook Processor
// ============================================================================

const EVENT_TO_TRIGGER_MAP: Record<string, string> = {
  Issue: "onIssue",
  Comment: "onComment",
};

const webhookProcessor: WebhookProcessor = {
  async validateWebhook(req: WebhookRequest): Promise<{ valid: boolean }> {
    // Linear sends x-linear-delivery header on all webhook deliveries
    const delivery = req.headers["x-linear-delivery"];
    return { valid: !!delivery };
  },

  async processWebhook(
    req: WebhookRequest,
    triggers: TriggerInfo[],
    _secrets: Record<string, string>
  ): Promise<WebhookMatch[]> {
    const eventType = req.headers["x-linear-event"] || "";
    const expectedTriggerType = EVENT_TO_TRIGGER_MAP[eventType];

    if (!expectedTriggerType) {
      return [];
    }

    const payload = req.body as Record<string, unknown>;
    const matches: WebhookMatch[] = [];

    for (const trigger of triggers) {
      if (trigger.triggerType !== expectedTriggerType) {
        continue;
      }

      matches.push({
        triggerId: trigger.id,
        event: {
          eventType,
          action: payload.action,
          type: payload.type,
          data: payload.data,
          url: payload.url,
          updatedFrom: payload.updatedFrom,
        },
      });
    }

    return matches;
  },
};

// ============================================================================
// Provider Definition
// ============================================================================

export const LinearServerProvider: ProviderDefinition<LinearSecrets> = {
  providerType: "linear",
  setupSteps,
  webhookProcessor,
  triggerDefinitions: {
    onIssue: onIssueTrigger as TriggerDefinition<unknown, unknown, LinearSecrets>,
    onComment: onCommentTrigger as TriggerDefinition<unknown, unknown, LinearSecrets>,
  },
};
