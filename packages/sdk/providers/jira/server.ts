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

// ============================================================================
// Provider Secrets Type
// ============================================================================

interface JiraSecrets {
  instance_url: string;
  email: string;
  api_token: string;
}

// ============================================================================
// Setup Steps
// ============================================================================

const setupSteps: SetupStep[] = [
  {
    type: "value",
    key: "instance_url",
    label: "Instance URL",
    description: "Your Jira Cloud instance URL",
    required: true,
    placeholder: "https://your-domain.atlassian.net",
  },
  {
    type: "value",
    key: "email",
    label: "Email",
    description: "Jira account email for authentication",
    required: true,
    placeholder: "user@example.com",
  },
  {
    type: "secret",
    key: "api_token",
    label: "API Token",
    description: "Jira API token (create at https://id.atlassian.com/manage-profile/security/api-tokens)",
    required: true,
    placeholder: "xxxxxxxxxxxxxxxxxxxx",
  },
];

// ============================================================================
// Input and State Schemas
// ============================================================================

const OnIssueCreatedInputSchema = z.object({
  project_key: z.string().optional(),
  issue_type: z.string().optional(),
});

const OnIssueCreatedStateSchema = z.object({
  webhookUrl: z.string(),
  project_key: z.string().optional(),
  issue_type: z.string().optional(),
  jql_filter: z.string().optional(),
});

const OnIssueUpdatedInputSchema = z.object({
  project_key: z.string().optional(),
  issue_type: z.string().optional(),
});

const OnIssueUpdatedStateSchema = z.object({
  webhookUrl: z.string(),
  project_key: z.string().optional(),
  issue_type: z.string().optional(),
  jql_filter: z.string().optional(),
});

const OnCommentAddedInputSchema = z.object({
  project_key: z.string().optional(),
});

const OnCommentAddedStateSchema = z.object({
  webhookUrl: z.string(),
  project_key: z.string().optional(),
  jql_filter: z.string().optional(),
});

// Type aliases
type OnIssueCreatedInput = z.infer<typeof OnIssueCreatedInputSchema>;
type OnIssueCreatedState = z.infer<typeof OnIssueCreatedStateSchema>;
type OnIssueUpdatedInput = z.infer<typeof OnIssueUpdatedInputSchema>;
type OnIssueUpdatedState = z.infer<typeof OnIssueUpdatedStateSchema>;
type OnCommentAddedInput = z.infer<typeof OnCommentAddedInputSchema>;
type OnCommentAddedState = z.infer<typeof OnCommentAddedStateSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

function buildJqlFilter(projectKey?: string, issueType?: string): string | undefined {
  const conditions: string[] = [];
  
  if (projectKey) {
    conditions.push(`project = ${projectKey}`);
  }
  if (issueType) {
    conditions.push(`issuetype = "${issueType}"`);
  }
  
  return conditions.length > 0 ? conditions.join(" AND ") : undefined;
}

// ============================================================================
// Trigger Definitions
// ============================================================================

const onIssueCreatedTrigger: TriggerDefinition<OnIssueCreatedInput, OnIssueCreatedState, JiraSecrets> = {
  inputSchema: OnIssueCreatedInputSchema,
  stateSchema: OnIssueCreatedStateSchema,
  lifecycle: {
    async create(ctx) {
      // Jira webhooks must be configured manually in the Jira UI
      // We store the webhook URL so the user can configure it
      const jqlFilter = buildJqlFilter(ctx.input.project_key, ctx.input.issue_type);
      
      return {
        webhookUrl: ctx.webhookUrl,
        project_key: ctx.input.project_key,
        issue_type: ctx.input.issue_type,
        jql_filter: jqlFilter,
      };
    },
    async destroy(_ctx) {
      // No API cleanup - webhook must be removed manually in Jira
    },
    async refresh(ctx) {
      // Cannot verify manual webhooks
      return ctx.state;
    },
  },
};

const onIssueUpdatedTrigger: TriggerDefinition<OnIssueUpdatedInput, OnIssueUpdatedState, JiraSecrets> = {
  inputSchema: OnIssueUpdatedInputSchema,
  stateSchema: OnIssueUpdatedStateSchema,
  lifecycle: {
    async create(ctx) {
      const jqlFilter = buildJqlFilter(ctx.input.project_key, ctx.input.issue_type);
      
      return {
        webhookUrl: ctx.webhookUrl,
        project_key: ctx.input.project_key,
        issue_type: ctx.input.issue_type,
        jql_filter: jqlFilter,
      };
    },
    async destroy(_ctx) {
      // No API cleanup - webhook must be removed manually in Jira
    },
    async refresh(ctx) {
      // Cannot verify manual webhooks
      return ctx.state;
    },
  },
};

const onCommentAddedTrigger: TriggerDefinition<OnCommentAddedInput, OnCommentAddedState, JiraSecrets> = {
  inputSchema: OnCommentAddedInputSchema,
  stateSchema: OnCommentAddedStateSchema,
  lifecycle: {
    async create(ctx) {
      const jqlFilter = ctx.input.project_key 
        ? `project = ${ctx.input.project_key}` 
        : undefined;
      
      return {
        webhookUrl: ctx.webhookUrl,
        project_key: ctx.input.project_key,
        jql_filter: jqlFilter,
      };
    },
    async destroy(_ctx) {
      // No API cleanup - webhook must be removed manually in Jira
    },
    async refresh(ctx) {
      // Cannot verify manual webhooks
      return ctx.state;
    },
  },
};

// ============================================================================
// Webhook Processor
// ============================================================================

// Map Jira webhook events to trigger types
const EVENT_TO_TRIGGER_MAP: Record<string, string> = {
  "jira:issue_created": "onIssueCreated",
  "jira:issue_updated": "onIssueUpdated",
  "comment_created": "onCommentAdded",
};

const webhookProcessor: WebhookProcessor = {
  async processWebhook(
    req: WebhookRequest,
    triggers: TriggerInfo[],
    _secrets: Record<string, string>
  ): Promise<WebhookMatch[]> {
    const payload = req.body as Record<string, unknown>;
    const webhookEvent = payload.webhookEvent as string;

    if (!webhookEvent) {
      return [];
    }

    const expectedTriggerType = EVENT_TO_TRIGGER_MAP[webhookEvent];
    if (!expectedTriggerType) {
      return [];
    }

    // Extract issue and project information
    const issue = payload.issue as Record<string, unknown> | undefined;
    const issueFields = issue?.fields as Record<string, unknown> | undefined;
    const project = issueFields?.project as Record<string, unknown> | undefined;
    const projectKey = project?.key as string | undefined;
    const issueType = (issueFields?.issuetype as Record<string, unknown>)?.name as string | undefined;

    const matches: WebhookMatch[] = [];

    for (const trigger of triggers) {
      // Only process triggers matching this event type
      if (trigger.triggerType !== expectedTriggerType) {
        continue;
      }

      const input = trigger.input || {};

      // Apply project key filter
      if (input.project_key && projectKey !== input.project_key) {
        continue;
      }

      // Apply issue type filter (for issue events)
      if (
        (expectedTriggerType === "onIssueCreated" || expectedTriggerType === "onIssueUpdated") &&
        input.issue_type &&
        issueType !== input.issue_type
      ) {
        continue;
      }

      matches.push({
        triggerId: trigger.id,
        event: {
          webhookEvent,
          projectKey,
          issueType,
          issue,
          ...payload,
        },
      });
    }

    return matches;
  },
};

// ============================================================================
// Provider Definition
// ============================================================================

export const JiraServerProvider: ProviderDefinition<JiraSecrets> = {
  providerType: "jira",
  setupSteps,
  webhookProcessor,
  triggerDefinitions: {
    onIssueCreated: onIssueCreatedTrigger as TriggerDefinition<unknown, unknown, JiraSecrets>,
    onIssueUpdated: onIssueUpdatedTrigger as TriggerDefinition<unknown, unknown, JiraSecrets>,
    onCommentAdded: onCommentAddedTrigger as TriggerDefinition<unknown, unknown, JiraSecrets>,
  },
};
