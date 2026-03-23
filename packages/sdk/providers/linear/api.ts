import type { LinearIssue, LinearComment } from "./types";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

export interface LinearApiConfig {
  apiToken: string;
}

async function linearRequest<T>(
  apiToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Linear API error (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

// ============================================================================
// Issue GraphQL fragments / queries
// ============================================================================

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  archivedAt
  createdAt
  dueDate
  assignee { id displayName }
  creator { id displayName }
  state { id name }
  cycle { id name }
`;

// ============================================================================
// LinearApi Class
// ============================================================================

export class LinearApi {
  private apiToken: string;

  constructor(config: LinearApiConfig) {
    this.apiToken = config.apiToken;
  }

  async createIssue(args: {
    teamId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    priority?: number;
    stateId?: string;
  }): Promise<LinearIssue> {
    const data = await linearRequest<{ issueCreate: { issue: LinearIssue } }>(
      this.apiToken,
      `mutation IssueCreate(
        $title: String!
        $teamId: String!
        $description: String
        $assigneeId: String
        $priority: Int
        $stateId: String
      ) {
        issueCreate(input: {
          title: $title
          teamId: $teamId
          description: $description
          assigneeId: $assigneeId
          priority: $priority
          stateId: $stateId
        }) {
          issue { ${ISSUE_FIELDS} }
        }
      }`,
      {
        title: args.title,
        teamId: args.teamId,
        description: args.description,
        assigneeId: args.assigneeId,
        priority: args.priority,
        stateId: args.stateId,
      }
    );
    return data.issueCreate.issue;
  }

  async getIssue(issueId: string): Promise<LinearIssue> {
    const data = await linearRequest<{ issue: LinearIssue }>(
      this.apiToken,
      `query Issue($issueId: String!) {
        issue(id: $issueId) { ${ISSUE_FIELDS} }
      }`,
      { issueId }
    );
    return data.issue;
  }

  async listIssues(args?: { limit?: number }): Promise<LinearIssue[]> {
    const first = args?.limit ?? 50;
    const data = await linearRequest<{ issues: { nodes: LinearIssue[] } }>(
      this.apiToken,
      `query Issues($first: Int) {
        issues(first: $first) {
          nodes { ${ISSUE_FIELDS} }
        }
      }`,
      { first }
    );
    return data.issues.nodes;
  }

  async updateIssue(
    issueId: string,
    args: {
      title?: string;
      description?: string;
      assigneeId?: string;
      priority?: number;
      stateId?: string;
    }
  ): Promise<LinearIssue> {
    const data = await linearRequest<{ issueUpdate: { issue: LinearIssue } }>(
      this.apiToken,
      `mutation IssueUpdate(
        $issueId: String!
        $title: String
        $description: String
        $assigneeId: String
        $priority: Int
        $stateId: String
      ) {
        issueUpdate(id: $issueId, input: {
          title: $title
          description: $description
          assigneeId: $assigneeId
          priority: $priority
          stateId: $stateId
        }) {
          issue { ${ISSUE_FIELDS} }
        }
      }`,
      {
        issueId,
        title: args.title,
        description: args.description,
        assigneeId: args.assigneeId,
        priority: args.priority,
        stateId: args.stateId,
      }
    );
    return data.issueUpdate.issue;
  }

  async deleteIssue(issueId: string): Promise<void> {
    await linearRequest<{ issueDelete: { success: boolean } }>(
      this.apiToken,
      `mutation IssueDelete($issueId: String!) {
        issueDelete(id: $issueId) { success }
      }`,
      { issueId }
    );
  }

  async addComment(
    issueId: string,
    body: string,
    parentId?: string
  ): Promise<{ id: string }> {
    const data = await linearRequest<{ commentCreate: { comment: LinearComment } }>(
      this.apiToken,
      `mutation CommentCreate($issueId: String!, $body: String!, $parentId: String) {
        commentCreate(input: { issueId: $issueId, body: $body, parentId: $parentId }) {
          comment { id }
        }
      }`,
      { issueId, body, parentId }
    );
    return { id: data.commentCreate.comment.id };
  }

  async createWebhook(
    url: string,
    resourceTypes: string[],
    teamId?: string
  ): Promise<{ id: string }> {
    const data = await linearRequest<{ webhookCreate: { webhook: { id: string } } }>(
      this.apiToken,
      `mutation WebhookCreate($url: String!, $resourceTypes: [String!]!, $teamId: String) {
        webhookCreate(input: { url: $url, resourceTypes: $resourceTypes, teamId: $teamId }) {
          webhook { id }
        }
      }`,
      { url, resourceTypes, teamId }
    );
    return { id: data.webhookCreate.webhook.id };
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await linearRequest<{ webhookDelete: { success: boolean } }>(
      this.apiToken,
      `mutation WebhookDelete($webhookId: String!) {
        webhookDelete(id: $webhookId) { success }
      }`,
      { webhookId }
    );
  }

  async getWebhook(webhookId: string): Promise<{ id: string } | null> {
    try {
      const data = await linearRequest<{ webhook: { id: string } | null }>(
        this.apiToken,
        `query Webhook($webhookId: String!) {
          webhook(id: $webhookId) { id }
        }`,
        { webhookId }
      );
      return data.webhook;
    } catch {
      return null;
    }
  }
}
