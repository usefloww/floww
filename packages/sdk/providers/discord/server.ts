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

interface DiscordSecrets {
  bot_token: string;
  public_key: string;
}

// ============================================================================
// Setup Steps
// ============================================================================

const setupSteps: SetupStep[] = [
  {
    type: "secret",
    key: "bot_token",
    label: "Bot Token",
    description: "Discord Bot Token from the Discord Developer Portal",
    required: true,
  },
  {
    type: "value",
    key: "public_key",
    label: "Public Key",
    description: "Discord Application Public Key for webhook signature verification",
    required: true,
  },
];

// ============================================================================
// Input and State Schemas
// ============================================================================

const OnMessageInputSchema = z.object({
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  user_id: z.string().optional(),
  include_bots: z.boolean().default(false),
  include_edits: z.boolean().default(false),
});

const OnMessageStateSchema = z.object({
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  user_id: z.string().optional(),
  include_bots: z.boolean().default(false),
  include_edits: z.boolean().default(false),
});

const OnReactionInputSchema = z.object({
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  emoji: z.string().optional(),
  user_id: z.string().optional(),
});

const OnReactionStateSchema = z.object({
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  emoji: z.string().optional(),
  user_id: z.string().optional(),
});

const OnMemberJoinInputSchema = z.object({
  guild_id: z.string().optional(),
});

const OnMemberJoinStateSchema = z.object({
  guild_id: z.string().optional(),
});

const OnMemberLeaveInputSchema = z.object({
  guild_id: z.string().optional(),
});

const OnMemberLeaveStateSchema = z.object({
  guild_id: z.string().optional(),
});

const OnMemberUpdateInputSchema = z.object({
  guild_id: z.string().optional(),
  track_roles: z.boolean().default(true),
  track_nickname: z.boolean().default(true),
});

const OnMemberUpdateStateSchema = z.object({
  guild_id: z.string().optional(),
  track_roles: z.boolean().default(true),
  track_nickname: z.boolean().default(true),
});

// Type aliases
type OnMessageInput = z.infer<typeof OnMessageInputSchema>;
type OnMessageState = z.infer<typeof OnMessageStateSchema>;
type OnReactionInput = z.infer<typeof OnReactionInputSchema>;
type OnReactionState = z.infer<typeof OnReactionStateSchema>;
type OnMemberJoinInput = z.infer<typeof OnMemberJoinInputSchema>;
type OnMemberJoinState = z.infer<typeof OnMemberJoinStateSchema>;
type OnMemberLeaveInput = z.infer<typeof OnMemberLeaveInputSchema>;
type OnMemberLeaveState = z.infer<typeof OnMemberLeaveStateSchema>;
type OnMemberUpdateInput = z.infer<typeof OnMemberUpdateInputSchema>;
type OnMemberUpdateState = z.infer<typeof OnMemberUpdateStateSchema>;

// ============================================================================
// Trigger Definitions
// ============================================================================

const onMessageTrigger: TriggerDefinition<OnMessageInput, OnMessageState, DiscordSecrets> = {
  inputSchema: OnMessageInputSchema,
  stateSchema: OnMessageStateSchema,
  lifecycle: {
    async create(ctx) {
      return {
        guild_id: ctx.input.guild_id,
        channel_id: ctx.input.channel_id,
        user_id: ctx.input.user_id,
        include_bots: ctx.input.include_bots,
        include_edits: ctx.input.include_edits,
      };
    },
    async destroy(_ctx) {
      // No cleanup needed
    },
    async refresh(ctx) {
      return ctx.state;
    },
  },
};

const onReactionTrigger: TriggerDefinition<OnReactionInput, OnReactionState, DiscordSecrets> = {
  inputSchema: OnReactionInputSchema,
  stateSchema: OnReactionStateSchema,
  lifecycle: {
    async create(ctx) {
      return {
        guild_id: ctx.input.guild_id,
        channel_id: ctx.input.channel_id,
        emoji: ctx.input.emoji,
        user_id: ctx.input.user_id,
      };
    },
    async destroy(_ctx) {
      // No cleanup needed
    },
    async refresh(ctx) {
      return ctx.state;
    },
  },
};

const onMemberJoinTrigger: TriggerDefinition<OnMemberJoinInput, OnMemberJoinState, DiscordSecrets> = {
  inputSchema: OnMemberJoinInputSchema,
  stateSchema: OnMemberJoinStateSchema,
  lifecycle: {
    async create(ctx) {
      return {
        guild_id: ctx.input.guild_id,
      };
    },
    async destroy(_ctx) {
      // No cleanup needed
    },
    async refresh(ctx) {
      return ctx.state;
    },
  },
};

const onMemberLeaveTrigger: TriggerDefinition<OnMemberLeaveInput, OnMemberLeaveState, DiscordSecrets> = {
  inputSchema: OnMemberLeaveInputSchema,
  stateSchema: OnMemberLeaveStateSchema,
  lifecycle: {
    async create(ctx) {
      return {
        guild_id: ctx.input.guild_id,
      };
    },
    async destroy(_ctx) {
      // No cleanup needed
    },
    async refresh(ctx) {
      return ctx.state;
    },
  },
};

const onMemberUpdateTrigger: TriggerDefinition<OnMemberUpdateInput, OnMemberUpdateState, DiscordSecrets> = {
  inputSchema: OnMemberUpdateInputSchema,
  stateSchema: OnMemberUpdateStateSchema,
  lifecycle: {
    async create(ctx) {
      return {
        guild_id: ctx.input.guild_id,
        track_roles: ctx.input.track_roles,
        track_nickname: ctx.input.track_nickname,
      };
    },
    async destroy(_ctx) {
      // No cleanup needed
    },
    async refresh(ctx) {
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

    // Handle Discord PING verification (type 1)
    if (payload.type === 1) {
      return {
        valid: true,
        challenge: true,
        response: { type: 1 },
        statusCode: 200,
      };
    }

    return { valid: true };
  },

  async processWebhook(
    req: WebhookRequest,
    triggers: TriggerInfo[],
    _secrets: Record<string, string>
  ): Promise<WebhookMatch[]> {
    const payload = req.body as Record<string, unknown>;
    const eventType = payload.t as string;
    const eventData = payload.d as Record<string, unknown>;

    if (!eventType || !eventData) {
      return [];
    }

    switch (eventType) {
      case "MESSAGE_CREATE":
        return processMessageEvent(eventData, triggers, false);
      case "MESSAGE_UPDATE":
        return processMessageEvent(eventData, triggers, true);
      case "MESSAGE_REACTION_ADD":
        return processReactionEvent(eventData, triggers);
      case "GUILD_MEMBER_ADD":
        return processMemberJoinEvent(eventData, triggers);
      case "GUILD_MEMBER_REMOVE":
        return processMemberLeaveEvent(eventData, triggers);
      case "GUILD_MEMBER_UPDATE":
        return processMemberUpdateEvent(eventData, triggers);
      default:
        return [];
    }
  },
};

function processMessageEvent(
  event: Record<string, unknown>,
  triggers: TriggerInfo[],
  isEdit: boolean
): WebhookMatch[] {
  const author = (event.author as Record<string, unknown>) || {};
  const isBot = author.bot as boolean;

  const matches: WebhookMatch[] = [];

  for (const trigger of triggers) {
    if (trigger.triggerType !== "onMessage") {
      continue;
    }

    const input = trigger.input || {};

    // For edits, check if include_edits is true
    if (isEdit && !input.include_edits) {
      continue;
    }

    // Apply bot filter
    if (isBot && !input.include_bots) {
      continue;
    }

    // Apply guild filter
    if (input.guild_id && event.guild_id !== input.guild_id) {
      continue;
    }

    // Apply channel filter
    if (input.channel_id && event.channel_id !== input.channel_id) {
      continue;
    }

    // Apply user filter
    if (input.user_id && author.id !== input.user_id) {
      continue;
    }

    matches.push({
      triggerId: trigger.id,
      event: {
        type: isEdit ? "MESSAGE_UPDATE" : "MESSAGE_CREATE",
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
  const emoji = event.emoji as Record<string, unknown> | undefined;
  const emojiName = emoji?.name as string;

  const matches: WebhookMatch[] = [];

  for (const trigger of triggers) {
    if (trigger.triggerType !== "onReaction") {
      continue;
    }

    const input = trigger.input || {};

    // Apply guild filter
    if (input.guild_id && event.guild_id !== input.guild_id) {
      continue;
    }

    // Apply channel filter
    if (input.channel_id && event.channel_id !== input.channel_id) {
      continue;
    }

    // Apply user filter
    if (input.user_id && event.user_id !== input.user_id) {
      continue;
    }

    // Apply emoji filter
    if (input.emoji && emojiName !== input.emoji) {
      continue;
    }

    matches.push({
      triggerId: trigger.id,
      event: {
        type: "MESSAGE_REACTION_ADD",
        ...event,
      },
    });
  }

  return matches;
}

function processMemberJoinEvent(
  event: Record<string, unknown>,
  triggers: TriggerInfo[]
): WebhookMatch[] {
  const matches: WebhookMatch[] = [];

  for (const trigger of triggers) {
    if (trigger.triggerType !== "onMemberJoin") {
      continue;
    }

    const input = trigger.input || {};

    // Apply guild filter
    if (input.guild_id && event.guild_id !== input.guild_id) {
      continue;
    }

    matches.push({
      triggerId: trigger.id,
      event: {
        type: "GUILD_MEMBER_ADD",
        ...event,
      },
    });
  }

  return matches;
}

function processMemberLeaveEvent(
  event: Record<string, unknown>,
  triggers: TriggerInfo[]
): WebhookMatch[] {
  const matches: WebhookMatch[] = [];

  for (const trigger of triggers) {
    if (trigger.triggerType !== "onMemberLeave") {
      continue;
    }

    const input = trigger.input || {};

    // Apply guild filter
    if (input.guild_id && event.guild_id !== input.guild_id) {
      continue;
    }

    matches.push({
      triggerId: trigger.id,
      event: {
        type: "GUILD_MEMBER_REMOVE",
        ...event,
      },
    });
  }

  return matches;
}

function processMemberUpdateEvent(
  event: Record<string, unknown>,
  triggers: TriggerInfo[]
): WebhookMatch[] {
  const matches: WebhookMatch[] = [];

  for (const trigger of triggers) {
    if (trigger.triggerType !== "onMemberUpdate") {
      continue;
    }

    const input = trigger.input || {};

    // Apply guild filter
    if (input.guild_id && event.guild_id !== input.guild_id) {
      continue;
    }

    matches.push({
      triggerId: trigger.id,
      event: {
        type: "GUILD_MEMBER_UPDATE",
        ...event,
      },
    });
  }

  return matches;
}

// ============================================================================
// Provider Definition
// ============================================================================

export const DiscordServerProvider: ProviderDefinition<DiscordSecrets> = {
  providerType: "discord",
  setupSteps,
  webhookProcessor,
  triggerDefinitions: {
    onMessage: onMessageTrigger as TriggerDefinition<unknown, unknown, DiscordSecrets>,
    onReaction: onReactionTrigger as TriggerDefinition<unknown, unknown, DiscordSecrets>,
    onMemberJoin: onMemberJoinTrigger as TriggerDefinition<unknown, unknown, DiscordSecrets>,
    onMemberLeave: onMemberLeaveTrigger as TriggerDefinition<unknown, unknown, DiscordSecrets>,
    onMemberUpdate: onMemberUpdateTrigger as TriggerDefinition<unknown, unknown, DiscordSecrets>,
  },
};
