import { Builtin } from "@developerflows/floww-sdk";

const builtin = new Builtin();

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
    builtin.triggers.onCron({
        expression: "*/5 * * * * *",
        handler: (ctx, event) => {
            console.log('Cron triggered')
        }
    })
]
