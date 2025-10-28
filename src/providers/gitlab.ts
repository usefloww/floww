import {
  WebhookTrigger,
  Handler,
  WebhookEvent,
  WebhookContext,
  WebhookSetupContext,
  WebhookTeardownContext,
} from "../common";
import { BaseProvider, BaseProviderConfig } from "./base";
import { GitLabApi } from "./gitlab/api";
import { registerTrigger } from "../userCode/providers";

export type GitlabConfig = BaseProviderConfig & {
  baseUrl?: string; // Allow custom GitLab instance URL
};

// GitLab webhook event types
export type GitLabMergeRequestCommentEvent = {
  object_kind: "note";
  user: {
    name: string;
    username: string;
    id: number;
  };
  project: {
    id: number;
    name: string;
  };
  merge_request: {
    id: number;
    iid: number;
    title: string;
  };
  object_attributes: {
    note: string;
    created_at: string;
  };
};

export type GitLabMergeRequestCommentTriggerArgs = {
  projectId?: string;
  groupId?: string;
  handler: Handler<
    WebhookEvent<GitLabMergeRequestCommentEvent>,
    WebhookContext
  >;
};

export class Gitlab extends BaseProvider {
  providerType = "gitlab";

  secretDefinitions = [
    {
      key: "accessToken",
      label: "GitLab Access Token",
      type: "password" as const,
      required: true,
    },
  ];

  constructor(config?: GitlabConfig | string) {
    super(config);
  }

  private getBaseUrl(): string {
    return (
      this.getConfig<string>("baseUrl", "https://gitlab.com") ||
      "https://gitlab.com"
    );
  }

  /**
   * Get a configured GitLab API client
   */
  getApi(): GitLabApi {
    return new GitLabApi({
      baseUrl: "",
      accessToken: "",
    });
  }

  actions = {};
  triggers = {
    onMergeRequestComment: (
      args: GitLabMergeRequestCommentTriggerArgs
    ): WebhookTrigger<GitLabMergeRequestCommentEvent> => {
      if (!args.projectId && !args.groupId) {
        throw new Error("Either projectId or groupId must be provided");
      }

      const triggerInput = args.projectId
        ? { projectId: args.projectId }
        : { groupId: args.groupId };

      return registerTrigger({
        type: "webhook",
        handler: args.handler,
        // Path will be auto-generated as /webhook/{uuid}
        method: "POST",
        validation: async (event: WebhookEvent) => {
          // TODO: Implement GitLab webhook signature validation
          return true;
        },
        setup: async (ctx: WebhookSetupContext) => {},
        teardown: async (ctx: WebhookTeardownContext) => {},
      }, {
        type: this.providerType,
        alias: this.credentialName,
        triggerType: "onMergeRequestComment",
        input: triggerInput,
      });
    },
  };
}
