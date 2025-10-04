import { Provider, WebhookTrigger, Handler, WebhookEvent, WebhookContext } from "../common";

// GitLab webhook event types
export type GitLabMergeRequestCommentEvent = {
    object_kind: 'note';
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
}

export type GitLabMergeRequestCommentTriggerArgs = {
    projectId?: string;
    groupId?: string;
    handler: Handler<WebhookEvent<GitLabMergeRequestCommentEvent>, WebhookContext>;
}

export class Gitlab implements Provider {
    private accessToken: string;

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    actions = {}
    triggers = {
        onMergeRequestComment: (args: GitLabMergeRequestCommentTriggerArgs): WebhookTrigger<GitLabMergeRequestCommentEvent> => {
            if (!args.projectId && !args.groupId) {
                throw new Error("Either projectId or groupId must be provided");
            }

            return {
                type: 'webhook',
                handler: args.handler,
                path: '/webhooks/gitlab/merge-request-comment',
                method: 'POST',
                validation: async (event) => {
                    // TODO: Implement GitLab webhook signature validation
                    return true;
                },
                setup: async (ctx) => {
                    // TODO: Register webhook with GitLab API
                    console.log('Register GitLab webhook at:', ctx.webhookUrl);
                }
            }
        }
    }
}