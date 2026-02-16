import { z } from "zod";
import type {
  ProviderDefinition,
  TriggerDefinition,
  WebhookProcessor,
  WebhookRequest,
  TriggerInfo,
  WebhookMatch,
  WebhookValidationResult,
  SetupStep,
} from "../base";

// ============================================================================
// Provider Secrets Type
// ============================================================================

interface SlackSecrets {
  bot_token: string;
  workspace_url?: string;
}

// ============================================================================
// Setup Steps
// ============================================================================

const setupSteps: SetupStep[] = [
  {
    type: "value",
    key: "workspace_url",
    label: "Workspace URL",
    description: "Your Slack workspace URL",
    required: false,
    placeholder: "https://yourworkspace.slack.com",
  },
  {
    type: "secret",
    key: "bot_token",
    label: "Bot Token",
    description: "Slack Bot User OAuth Token",
    required: true,
    placeholder: "xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx",
  },
  {
    type: "webhook",
    key: "webhook_url",
    label: "Webhook URL",
    description:
      "Configure this URL in your Slack App's Event Subscriptions. " +
      "Go to https://api.slack.com/apps, select your app, navigate to 'Event Subscriptions', " +
      "enable events, and paste this URL as the Request URL.",
  },
];

// ============================================================================
// Input and State Schemas
// ============================================================================

const OnMessageInputSchema = z.object({
  channel_id: z.string().optional(),
  user_id: z.string().optional(),
  include_thread_messages: z.boolean().default(false),
});

const OnMessageStateSchema = z.object({
  channel_id: z.string().optional(),
  user_id: z.string().optional(),
  include_thread_messages: z.boolean().default(false),
});

const OnReactionInputSchema = z.object({
  channel_id: z.string().optional(),
  user_id: z.string().optional(),
  reaction: z.string().optional(),
});

const OnReactionStateSchema = z.object({
  channel_id: z.string().optional(),
  user_id: z.string().optional(),
  reaction: z.string().optional(),
});

// Type aliases
type OnMessageInput = z.infer<typeof OnMessageInputSchema>;
type OnMessageState = z.infer<typeof OnMessageStateSchema>;
type OnReactionInput = z.infer<typeof OnReactionInputSchema>;
type OnReactionState = z.infer<typeof OnReactionStateSchema>;

// ============================================================================
// Trigger Definitions
// ============================================================================

const onMessageTrigger: TriggerDefinition<OnMessageInput, OnMessageState, SlackSecrets> = {
  inputSchema: OnMessageInputSchema,
  stateSchema: OnMessageStateSchema,
  lifecycle: {
    async create(ctx) {
      // Slack webhooks are configured manually in the Slack App dashboard
      // No API call needed - just store the filter configuration
      return {
        channel_id: ctx.input.channel_id,
        user_id: ctx.input.user_id,
        include_thread_messages: ctx.input.include_thread_messages,
      };
    },
    async destroy(_ctx) {
      // No cleanup needed - Event Subscriptions remain in Slack App
    },
    async refresh(ctx) {
      // No verification needed - return existing state
      return ctx.state;
    },
  },
};

const onReactionTrigger: TriggerDefinition<OnReactionInput, OnReactionState, SlackSecrets> = {
  inputSchema: OnReactionInputSchema,
  stateSchema: OnReactionStateSchema,
  lifecycle: {
    async create(ctx) {
      // Slack webhooks are configured manually in the Slack App dashboard
      // No API call needed - just store the filter configuration
      return {
        channel_id: ctx.input.channel_id,
        user_id: ctx.input.user_id,
        reaction: ctx.input.reaction,
      };
    },
    async destroy(_ctx) {
      // No cleanup needed - Event Subscriptions remain in Slack App
    },
    async refresh(ctx) {
      // No verification needed - return existing state
      return ctx.state;
    },
  },
};

// ============================================================================
// Webhook Processor
// ============================================================================

const webhookProcessor: WebhookProcessor = {
  async validateWebhook(
    req: WebhookRequest,
    _secrets: Record<string, string>
  ): Promise<WebhookValidationResult> {
    const payload = req.body as Record<string, unknown>;

    // Handle Slack URL verification challenge
    if (payload.type === "url_verification") {
      const challenge = payload.challenge as string;
      if (challenge) {
        return {
          valid: true,
          challenge: true,
          response: { challenge },
          statusCode: 200,
        };
      }
    }

    return { valid: true };
  },

  async processWebhook(
    req: WebhookRequest,
    triggers: TriggerInfo[],
    _secrets: Record<string, string>
  ): Promise<WebhookMatch[]> {
    const payload = req.body as Record<string, unknown>;

    // Only process event_callback events
    if (payload.type !== "event_callback") {
      return [];
    }

    const event = payload.event as Record<string, unknown>;
    const eventType = event?.type as string;

    if (eventType === "message") {
      return processMessageEvent(event, triggers);
    }

    if (eventType === "reaction_added") {
      return processReactionEvent(event, triggers);
    }

    return [];
  },
};

function processMessageEvent(
  event: Record<string, unknown>,
  triggers: TriggerInfo[]
): WebhookMatch[] {
  // Filter bot messages to avoid loops
  if (event.bot_id || event.subtype === "bot_message") {
    return [];
  }

  // Filter message change/delete events - only process new messages
  const subtype = event.subtype as string | undefined;
  if (subtype && subtype !== "thread_broadcast") {
    return [];
  }

  const matches: WebhookMatch[] = [];

  for (const trigger of triggers) {
    // Only process onMessage triggers
    if (trigger.triggerType !== "onMessage") {
      continue;
    }

    const input = trigger.input || {};

    // Apply channel filter if specified
    if (input.channel_id && event.channel !== input.channel_id) {
      continue;
    }

    // Apply user filter if specified
    if (input.user_id && event.user !== input.user_id) {
      continue;
    }

    // Filter thread messages if not included
    if (!input.include_thread_messages) {
      const threadTs = event.thread_ts as string | undefined;
      const messageTs = event.ts as string;
      if (threadTs && threadTs !== messageTs) {
        continue;
      }
    }

    // This trigger matches!
    matches.push({
      triggerId: trigger.id,
      event: {
        type: "message",
        channel: event.channel,
        user: event.user,
        text: event.text,
        ts: event.ts,
        thread_ts: event.thread_ts,
        channel_type: event.channel_type,
        ...event,
      },
    });
  }

  return matches;
}

function processReactionEvent(
  event: Record<string, unknown>,
  triggers: TriggerInfo[]
): WebhookMatch[] {
  const item = event.item as Record<string, unknown> | undefined;
  const channel = item?.channel as string | undefined;

  const matches: WebhookMatch[] = [];

  for (const trigger of triggers) {
    // Only process onReaction triggers
    if (trigger.triggerType !== "onReaction") {
      continue;
    }

    const input = trigger.input || {};

    // Apply channel filter if specified
    if (input.channel_id && channel !== input.channel_id) {
      continue;
    }

    // Apply user filter if specified (user who added the reaction)
    if (input.user_id && event.user !== input.user_id) {
      continue;
    }

    // Apply reaction name filter if specified
    if (input.reaction && event.reaction !== input.reaction) {
      continue;
    }

    // This trigger matches!
    matches.push({
      triggerId: trigger.id,
      event: {
        type: "reaction_added",
        user: event.user,
        reaction: event.reaction,
        item_user: event.item_user,
        item,
        event_ts: event.event_ts,
        ...event,
      },
    });
  }

  return matches;
}

// ============================================================================
// Provider Definition
// ============================================================================

export const SlackServerProvider: ProviderDefinition<SlackSecrets> = {
  providerType: "slack",
  setupSteps,
  webhookProcessor,
  triggerDefinitions: {
    onMessage: onMessageTrigger as TriggerDefinition<unknown, unknown, SlackSecrets>,
    onReaction: onReactionTrigger as TriggerDefinition<unknown, unknown, SlackSecrets>,
  },
};
