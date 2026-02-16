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

interface GitHubSecrets {
  access_token: string;
  server_url?: string;
}

// ============================================================================
// Setup Steps
// ============================================================================

const setupSteps: SetupStep[] = [
  {
    type: "value",
    key: "server_url",
    label: "GitHub Server URL",
    description: "GitHub API server URL (use default for GitHub.com)",
    required: false,
    placeholder: "https://api.github.com",
  },
  {
    type: "secret",
    key: "access_token",
    label: "Access Token",
    description: "GitHub Personal Access Token or OAuth2 token",
    required: true,
    placeholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
  },
];

// ============================================================================
// Input and State Schemas
// ============================================================================

const OnPushInputSchema = z.object({
  owner: z.string(),
  repository: z.string(),
  branch: z.string().optional(),
});

const OnPushStateSchema = z.object({
  webhookId: z.number(),
  owner: z.string(),
  repository: z.string(),
  branch: z.string().optional(),
});

const OnPullRequestInputSchema = z.object({
  owner: z.string(),
  repository: z.string(),
  actions: z.array(z.string()).optional(),
});

const OnPullRequestStateSchema = z.object({
  webhookId: z.number(),
  owner: z.string(),
  repository: z.string(),
  actions: z.array(z.string()).optional(),
});

const OnIssueInputSchema = z.object({
  owner: z.string(),
  repository: z.string(),
  actions: z.array(z.string()).optional(),
});

const OnIssueStateSchema = z.object({
  webhookId: z.number(),
  owner: z.string(),
  repository: z.string(),
  actions: z.array(z.string()).optional(),
});

const OnIssueCommentInputSchema = z.object({
  owner: z.string(),
  repository: z.string(),
  actions: z.array(z.string()).optional(),
});

const OnIssueCommentStateSchema = z.object({
  webhookId: z.number(),
  owner: z.string(),
  repository: z.string(),
  actions: z.array(z.string()).optional(),
});

const OnReleaseInputSchema = z.object({
  owner: z.string(),
  repository: z.string(),
  actions: z.array(z.string()).optional(),
});

const OnReleaseStateSchema = z.object({
  webhookId: z.number(),
  owner: z.string(),
  repository: z.string(),
  actions: z.array(z.string()).optional(),
});

// Type aliases
type OnPushInput = z.infer<typeof OnPushInputSchema>;
type OnPushState = z.infer<typeof OnPushStateSchema>;
type OnPullRequestInput = z.infer<typeof OnPullRequestInputSchema>;
type OnPullRequestState = z.infer<typeof OnPullRequestStateSchema>;
type OnIssueInput = z.infer<typeof OnIssueInputSchema>;
type OnIssueState = z.infer<typeof OnIssueStateSchema>;
type OnIssueCommentInput = z.infer<typeof OnIssueCommentInputSchema>;
type OnIssueCommentState = z.infer<typeof OnIssueCommentStateSchema>;
type OnReleaseInput = z.infer<typeof OnReleaseInputSchema>;
type OnReleaseState = z.infer<typeof OnReleaseStateSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

function getServerUrl(secrets: GitHubSecrets): string {
  return secrets.server_url || "https://api.github.com";
}

async function createGitHubWebhook(
  secrets: GitHubSecrets,
  owner: string,
  repo: string,
  webhookUrl: string,
  events: string[]
): Promise<number> {
  const serverUrl = getServerUrl(secrets);
  const response = await fetch(
    `${serverUrl}/repos/${owner}/${repo}/hooks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secrets.access_token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        config: {
          url: webhookUrl,
          content_type: "json",
          insecure_ssl: "0",
        },
        events,
        active: true,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create GitHub webhook: ${error}`);
  }

  const webhook = (await response.json()) as { id: number };
  return webhook.id;
}

async function deleteGitHubWebhook(
  secrets: GitHubSecrets,
  owner: string,
  repo: string,
  webhookId: number
): Promise<void> {
  const serverUrl = getServerUrl(secrets);
  const response = await fetch(
    `${serverUrl}/repos/${owner}/${repo}/hooks/${webhookId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secrets.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete GitHub webhook: ${error}`);
  }
}

async function verifyGitHubWebhook(
  secrets: GitHubSecrets,
  owner: string,
  repo: string,
  webhookId: number
): Promise<boolean> {
  const serverUrl = getServerUrl(secrets);
  const response = await fetch(
    `${serverUrl}/repos/${owner}/${repo}/hooks/${webhookId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secrets.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  return response.ok;
}

// ============================================================================
// Trigger Definitions
// ============================================================================

const onPushTrigger: TriggerDefinition<OnPushInput, OnPushState, GitHubSecrets> = {
  inputSchema: OnPushInputSchema,
  stateSchema: OnPushStateSchema,
  lifecycle: {
    async create(ctx) {
      const webhookId = await createGitHubWebhook(
        ctx.secrets,
        ctx.input.owner,
        ctx.input.repository,
        ctx.webhookUrl,
        ["push"]
      );

      return {
        webhookId,
        owner: ctx.input.owner,
        repository: ctx.input.repository,
        branch: ctx.input.branch,
      };
    },
    async destroy(ctx) {
      await deleteGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );
    },
    async refresh(ctx) {
      const exists = await verifyGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );

      if (!exists) {
        throw new Error("GitHub webhook no longer exists");
      }

      return ctx.state;
    },
  },
};

const onPullRequestTrigger: TriggerDefinition<OnPullRequestInput, OnPullRequestState, GitHubSecrets> = {
  inputSchema: OnPullRequestInputSchema,
  stateSchema: OnPullRequestStateSchema,
  lifecycle: {
    async create(ctx) {
      const webhookId = await createGitHubWebhook(
        ctx.secrets,
        ctx.input.owner,
        ctx.input.repository,
        ctx.webhookUrl,
        ["pull_request"]
      );

      return {
        webhookId,
        owner: ctx.input.owner,
        repository: ctx.input.repository,
        actions: ctx.input.actions,
      };
    },
    async destroy(ctx) {
      await deleteGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );
    },
    async refresh(ctx) {
      const exists = await verifyGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );

      if (!exists) {
        throw new Error("GitHub webhook no longer exists");
      }

      return ctx.state;
    },
  },
};

const onIssueTrigger: TriggerDefinition<OnIssueInput, OnIssueState, GitHubSecrets> = {
  inputSchema: OnIssueInputSchema,
  stateSchema: OnIssueStateSchema,
  lifecycle: {
    async create(ctx) {
      const webhookId = await createGitHubWebhook(
        ctx.secrets,
        ctx.input.owner,
        ctx.input.repository,
        ctx.webhookUrl,
        ["issues"]
      );

      return {
        webhookId,
        owner: ctx.input.owner,
        repository: ctx.input.repository,
        actions: ctx.input.actions,
      };
    },
    async destroy(ctx) {
      await deleteGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );
    },
    async refresh(ctx) {
      const exists = await verifyGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );

      if (!exists) {
        throw new Error("GitHub webhook no longer exists");
      }

      return ctx.state;
    },
  },
};

const onIssueCommentTrigger: TriggerDefinition<OnIssueCommentInput, OnIssueCommentState, GitHubSecrets> = {
  inputSchema: OnIssueCommentInputSchema,
  stateSchema: OnIssueCommentStateSchema,
  lifecycle: {
    async create(ctx) {
      const webhookId = await createGitHubWebhook(
        ctx.secrets,
        ctx.input.owner,
        ctx.input.repository,
        ctx.webhookUrl,
        ["issue_comment"]
      );

      return {
        webhookId,
        owner: ctx.input.owner,
        repository: ctx.input.repository,
        actions: ctx.input.actions,
      };
    },
    async destroy(ctx) {
      await deleteGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );
    },
    async refresh(ctx) {
      const exists = await verifyGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );

      if (!exists) {
        throw new Error("GitHub webhook no longer exists");
      }

      return ctx.state;
    },
  },
};

const onReleaseTrigger: TriggerDefinition<OnReleaseInput, OnReleaseState, GitHubSecrets> = {
  inputSchema: OnReleaseInputSchema,
  stateSchema: OnReleaseStateSchema,
  lifecycle: {
    async create(ctx) {
      const webhookId = await createGitHubWebhook(
        ctx.secrets,
        ctx.input.owner,
        ctx.input.repository,
        ctx.webhookUrl,
        ["release"]
      );

      return {
        webhookId,
        owner: ctx.input.owner,
        repository: ctx.input.repository,
        actions: ctx.input.actions,
      };
    },
    async destroy(ctx) {
      await deleteGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );
    },
    async refresh(ctx) {
      const exists = await verifyGitHubWebhook(
        ctx.secrets,
        ctx.state.owner,
        ctx.state.repository,
        ctx.state.webhookId
      );

      if (!exists) {
        throw new Error("GitHub webhook no longer exists");
      }

      return ctx.state;
    },
  },
};

// ============================================================================
// Webhook Processor
// ============================================================================

// Map GitHub event types to trigger types
const EVENT_TO_TRIGGER_MAP: Record<string, string> = {
  push: "onPush",
  pull_request: "onPullRequest",
  issues: "onIssue",
  issue_comment: "onIssueComment",
  release: "onRelease",
};

const webhookProcessor: WebhookProcessor = {
  async processWebhook(
    req: WebhookRequest,
    triggers: TriggerInfo[],
    _secrets: Record<string, string>
  ): Promise<WebhookMatch[]> {
    const eventType = req.headers["x-github-event"] || "";
    const payload = req.body as Record<string, unknown>;

    // Handle ping events (GitHub webhook verification)
    if (eventType === "ping") {
      return [];
    }

    // Get expected trigger type for this event
    const expectedTriggerType = EVENT_TO_TRIGGER_MAP[eventType];
    if (!expectedTriggerType) {
      return [];
    }

    // Extract common webhook data
    const repository = (payload.repository as Record<string, unknown>) || {};
    const owner = (repository.owner as Record<string, unknown>)?.login as string;
    const repoName = repository.name as string;
    const action = payload.action as string | undefined;

    // For push events, extract branch
    const ref = payload.ref as string | undefined;
    const branch = ref?.replace("refs/heads/", "");

    const matches: WebhookMatch[] = [];

    for (const trigger of triggers) {
      // Only process triggers matching this event type
      if (trigger.triggerType !== expectedTriggerType) {
        continue;
      }

      const input = trigger.input || {};

      // Apply repository owner filter
      if (input.owner && owner !== input.owner) {
        continue;
      }

      // Apply repository name filter
      if (input.repository && repoName !== input.repository) {
        continue;
      }

      // Apply action filter (for events with actions)
      if (input.actions && Array.isArray(input.actions) && action) {
        if (!input.actions.includes(action)) {
          continue;
        }
      }

      // Apply branch filter for push events
      if (input.branch && branch && branch !== input.branch) {
        continue;
      }

      // This trigger matches!
      matches.push({
        triggerId: trigger.id,
        event: {
          eventType,
          action,
          repository: `${owner}/${repoName}`,
          branch,
          payload,
        },
      });
    }

    return matches;
  },
};

// ============================================================================
// Provider Definition
// ============================================================================

export const GitHubServerProvider: ProviderDefinition<GitHubSecrets> = {
  providerType: "github",
  setupSteps,
  webhookProcessor,
  triggerDefinitions: {
    onPush: onPushTrigger as TriggerDefinition<unknown, unknown, GitHubSecrets>,
    onPullRequest: onPullRequestTrigger as TriggerDefinition<unknown, unknown, GitHubSecrets>,
    onIssue: onIssueTrigger as TriggerDefinition<unknown, unknown, GitHubSecrets>,
    onIssueComment: onIssueCommentTrigger as TriggerDefinition<unknown, unknown, GitHubSecrets>,
    onRelease: onReleaseTrigger as TriggerDefinition<unknown, unknown, GitHubSecrets>,
  },
};
