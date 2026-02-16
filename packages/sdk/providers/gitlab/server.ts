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

interface GitLabSecrets {
  accessToken: string;
  url?: string;
}

// ============================================================================
// Setup Steps
// ============================================================================

const setupSteps: SetupStep[] = [
  {
    type: "value",
    key: "url",
    label: "Instance URL",
    description: "GitLab base URL",
    required: false,
    placeholder: "https://gitlab.com",
  },
  {
    type: "secret",
    key: "accessToken",
    label: "Access Token",
    description: "Personal access token",
    required: true,
    placeholder: "glpat-xxxxxxxxxxxxxxxxxxxx",
  },
];

// ============================================================================
// Input and State Schemas
// ============================================================================

const OnMergeRequestCommentInputSchema = z.object({
  projectId: z.string().optional(),
  groupId: z.string().optional(),
});

const OnMergeRequestCommentStateSchema = z.object({
  webhookId: z.number(),
  projectId: z.string().optional(),
  groupId: z.string().optional(),
});

const OnMergeRequestInputSchema = z.object({
  projectId: z.string().optional(),
  groupId: z.string().optional(),
  actions: z.array(z.string()).optional(),
});

const OnMergeRequestStateSchema = z.object({
  webhookId: z.number(),
  projectId: z.string().optional(),
  groupId: z.string().optional(),
  actions: z.array(z.string()).optional(),
});

// Type aliases
type OnMergeRequestCommentInput = z.infer<typeof OnMergeRequestCommentInputSchema>;
type OnMergeRequestCommentState = z.infer<typeof OnMergeRequestCommentStateSchema>;
type OnMergeRequestInput = z.infer<typeof OnMergeRequestInputSchema>;
type OnMergeRequestState = z.infer<typeof OnMergeRequestStateSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

function getGitLabUrl(secrets: GitLabSecrets): string {
  return secrets.url || "https://gitlab.com";
}

async function createGitLabWebhook(
  secrets: GitLabSecrets,
  projectId: string | undefined,
  groupId: string | undefined,
  webhookUrl: string,
  events: { note_events?: boolean; merge_requests_events?: boolean; push_events?: boolean }
): Promise<number> {
  const baseUrl = getGitLabUrl(secrets);
  
  const webhookData = {
    url: webhookUrl,
    note_events: events.note_events ?? false,
    merge_requests_events: events.merge_requests_events ?? false,
    push_events: events.push_events ?? false,
    issues_events: false,
  };

  let apiUrl: string;
  if (projectId) {
    apiUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/hooks`;
  } else if (groupId) {
    apiUrl = `${baseUrl}/api/v4/groups/${encodeURIComponent(groupId)}/hooks`;
  } else {
    throw new Error("Either projectId or groupId must be provided");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": secrets.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(webhookData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create GitLab webhook: ${error}`);
  }

  const webhook = (await response.json()) as { id: number };
  return webhook.id;
}

async function deleteGitLabWebhook(
  secrets: GitLabSecrets,
  projectId: string | undefined,
  groupId: string | undefined,
  webhookId: number
): Promise<void> {
  const baseUrl = getGitLabUrl(secrets);

  let apiUrl: string;
  if (projectId) {
    apiUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/hooks/${webhookId}`;
  } else if (groupId) {
    apiUrl = `${baseUrl}/api/v4/groups/${encodeURIComponent(groupId)}/hooks/${webhookId}`;
  } else {
    return;
  }

  const response = await fetch(apiUrl, {
    method: "DELETE",
    headers: {
      "PRIVATE-TOKEN": secrets.accessToken,
    },
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete GitLab webhook: ${error}`);
  }
}

async function verifyGitLabWebhook(
  secrets: GitLabSecrets,
  projectId: string | undefined,
  groupId: string | undefined,
  webhookId: number
): Promise<boolean> {
  const baseUrl = getGitLabUrl(secrets);

  let apiUrl: string;
  if (projectId) {
    apiUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/hooks/${webhookId}`;
  } else if (groupId) {
    apiUrl = `${baseUrl}/api/v4/groups/${encodeURIComponent(groupId)}/hooks/${webhookId}`;
  } else {
    return false;
  }

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "PRIVATE-TOKEN": secrets.accessToken,
    },
  });

  return response.ok;
}

// ============================================================================
// Trigger Definitions
// ============================================================================

const onMergeRequestCommentTrigger: TriggerDefinition<OnMergeRequestCommentInput, OnMergeRequestCommentState, GitLabSecrets> = {
  inputSchema: OnMergeRequestCommentInputSchema,
  stateSchema: OnMergeRequestCommentStateSchema,
  lifecycle: {
    async create(ctx) {
      const webhookId = await createGitLabWebhook(
        ctx.secrets,
        ctx.input.projectId,
        ctx.input.groupId,
        ctx.webhookUrl,
        { note_events: true, merge_requests_events: true }
      );

      return {
        webhookId,
        projectId: ctx.input.projectId,
        groupId: ctx.input.groupId,
      };
    },
    async destroy(ctx) {
      await deleteGitLabWebhook(
        ctx.secrets,
        ctx.state.projectId,
        ctx.state.groupId,
        ctx.state.webhookId
      );
    },
    async refresh(ctx) {
      const exists = await verifyGitLabWebhook(
        ctx.secrets,
        ctx.state.projectId,
        ctx.state.groupId,
        ctx.state.webhookId
      );

      if (!exists) {
        throw new Error("GitLab webhook no longer exists");
      }

      return ctx.state;
    },
  },
};

const onMergeRequestTrigger: TriggerDefinition<OnMergeRequestInput, OnMergeRequestState, GitLabSecrets> = {
  inputSchema: OnMergeRequestInputSchema,
  stateSchema: OnMergeRequestStateSchema,
  lifecycle: {
    async create(ctx) {
      const webhookId = await createGitLabWebhook(
        ctx.secrets,
        ctx.input.projectId,
        ctx.input.groupId,
        ctx.webhookUrl,
        { merge_requests_events: true }
      );

      return {
        webhookId,
        projectId: ctx.input.projectId,
        groupId: ctx.input.groupId,
        actions: ctx.input.actions,
      };
    },
    async destroy(ctx) {
      await deleteGitLabWebhook(
        ctx.secrets,
        ctx.state.projectId,
        ctx.state.groupId,
        ctx.state.webhookId
      );
    },
    async refresh(ctx) {
      const exists = await verifyGitLabWebhook(
        ctx.secrets,
        ctx.state.projectId,
        ctx.state.groupId,
        ctx.state.webhookId
      );

      if (!exists) {
        throw new Error("GitLab webhook no longer exists");
      }

      return ctx.state;
    },
  },
};

// ============================================================================
// Webhook Processor
// ============================================================================

const webhookProcessor: WebhookProcessor = {
  async processWebhook(
    req: WebhookRequest,
    triggers: TriggerInfo[],
    _secrets: Record<string, string>
  ): Promise<WebhookMatch[]> {
    const payload = req.body as Record<string, unknown>;
    const eventType = payload.object_kind as string;

    if (!eventType) {
      return [];
    }

    const matches: WebhookMatch[] = [];

    // Handle note (comment) events
    if (eventType === "note") {
      const noteableType = payload.object_attributes && 
        (payload.object_attributes as Record<string, unknown>).noteable_type;
      
      // Only process merge request comments
      if (noteableType === "MergeRequest") {
        for (const trigger of triggers) {
          if (trigger.triggerType !== "onMergeRequestComment") {
            continue;
          }

          const input = trigger.input || {};
          const project = payload.project as Record<string, unknown> | undefined;
          const projectId = project?.id?.toString();

          // Apply project filter
          if (input.projectId && projectId !== input.projectId) {
            continue;
          }

          matches.push({
            triggerId: trigger.id,
            event: {
              type: "note",
              noteableType: "MergeRequest",
              ...payload,
            },
          });
        }
      }
    }

    // Handle merge request events
    if (eventType === "merge_request") {
      const objectAttributes = payload.object_attributes as Record<string, unknown> | undefined;
      const action = objectAttributes?.action as string | undefined;

      for (const trigger of triggers) {
        if (trigger.triggerType !== "onMergeRequest") {
          continue;
        }

        const input = trigger.input || {};
        const project = payload.project as Record<string, unknown> | undefined;
        const projectId = project?.id?.toString();

        // Apply project filter
        if (input.projectId && projectId !== input.projectId) {
          continue;
        }

        // Apply action filter
        if (input.actions && Array.isArray(input.actions) && action) {
          if (!input.actions.includes(action)) {
            continue;
          }
        }

        matches.push({
          triggerId: trigger.id,
          event: {
            type: "merge_request",
            action,
            ...payload,
          },
        });
      }
    }

    return matches;
  },
};

// ============================================================================
// Provider Definition
// ============================================================================

export const GitLabServerProvider: ProviderDefinition<GitLabSecrets> = {
  providerType: "gitlab",
  setupSteps,
  webhookProcessor,
  triggerDefinitions: {
    onMergeRequestComment: onMergeRequestCommentTrigger as TriggerDefinition<unknown, unknown, GitLabSecrets>,
    onMergeRequest: onMergeRequestTrigger as TriggerDefinition<unknown, unknown, GitLabSecrets>,
  },
};
