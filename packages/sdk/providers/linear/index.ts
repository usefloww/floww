import {
  WebhookTrigger,
  Handler,
  WebhookEvent,
  WebhookContext,
} from "../../common";
import { BaseProvider, BaseProviderConfig } from "../base";
import { LinearApi } from "./api";
import { registerTrigger } from "../../userCode/providers";
import type { LinearIssue, LinearIssueEvent, LinearCommentEvent } from "./types";

export type LinearConfig = BaseProviderConfig;

// ============================================================================
// Trigger Args Types
// ============================================================================

export type LinearOnIssueArgs = {
  handler: Handler<WebhookEvent<LinearIssueEvent>, WebhookContext>;
};

export type LinearOnCommentArgs = {
  handler: Handler<WebhookEvent<LinearCommentEvent>, WebhookContext>;
};

// ============================================================================
// Actions Class
// ============================================================================

class LinearActions {
  constructor(private getApi: () => LinearApi) {}

  async createIssue(args: {
    teamId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    priority?: number;
    stateId?: string;
  }): Promise<LinearIssue> {
    return this.getApi().createIssue(args);
  }

  async getIssue(args: { issueId: string }): Promise<LinearIssue> {
    return this.getApi().getIssue(args.issueId);
  }

  async listIssues(args?: { limit?: number }): Promise<LinearIssue[]> {
    return this.getApi().listIssues(args);
  }

  async updateIssue(args: {
    issueId: string;
    title?: string;
    description?: string;
    assigneeId?: string;
    priority?: number;
    stateId?: string;
  }): Promise<LinearIssue> {
    const { issueId, ...rest } = args;
    return this.getApi().updateIssue(issueId, rest);
  }

  async deleteIssue(args: { issueId: string }): Promise<void> {
    return this.getApi().deleteIssue(args.issueId);
  }

  async addComment(args: {
    issueId: string;
    body: string;
    parentId?: string;
  }): Promise<{ id: string }> {
    return this.getApi().addComment(args.issueId, args.body, args.parentId);
  }
}

// ============================================================================
// Linear Provider Class
// ============================================================================

export class Linear extends BaseProvider {
  private api?: LinearApi;
  actions: LinearActions;

  constructor(config?: LinearConfig | string) {
    super("linear", config);
    this.actions = new LinearActions(() => this.getApi());
    this.actions = this.wrapActionsWithPolicyCheck(this.actions);
  }

  private getApi(): LinearApi {
    if (!this.api) {
      const apiToken = this.getSecret("api_token");
      this.api = new LinearApi({ apiToken });
    }
    return this.api;
  }

  triggers = {
    onIssue: (args: LinearOnIssueArgs): WebhookTrigger<LinearIssueEvent> => {
      return registerTrigger(
        {
          type: "webhook",
          handler: args.handler,
          method: "POST",
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onIssue",
          input: {},
        }
      );
    },

    onComment: (args: LinearOnCommentArgs): WebhookTrigger<LinearCommentEvent> => {
      return registerTrigger(
        {
          type: "webhook",
          handler: args.handler,
          method: "POST",
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onComment",
          input: {},
        }
      );
    },
  };
}

// Export types for user convenience
export type { LinearIssue, LinearIssueEvent, LinearCommentEvent } from "./types";
