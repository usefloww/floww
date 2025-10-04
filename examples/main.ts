import { Builtin, Gitlab } from "@developerflows/floww-sdk";

// Export provider instances so they can be configured with credentials
export const builtin = new Builtin();
export const gitlab = new Gitlab("work");

type CustomBody = {
    message: string;
}

export default [
    builtin.triggers.onWebhook<CustomBody>({
        handler: (ctx, event) => {
            console.log('Webhook received:', event.body.message);
            console.log('Headers:', event.headers);
        },
        path: '/custom',
    }),
    gitlab.triggers.onMergeRequestComment({
        projectId: "69402458", 
        handler: (ctx, event) => {
            console.log('Gitlab event:', event);
        },
    }),
    builtin.triggers.onCron({
        expression: "*/5 * * * * *",
        handler: (ctx, event) => {
            console.log('Cron triggered')
        }
    })
]
