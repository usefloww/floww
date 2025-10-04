import {
    CronTrigger,
    CronTriggerArgs,
    WebhookTrigger,
    WebhookTriggerArgs
} from "../common"
import { BaseProvider } from "./base";

export class Builtin extends BaseProvider {
    providerType = 'builtin';

    constructor() {
        super(); // No credential name needed for builtin
    }

    actions = {}
    triggers = {
        onCron: (args: CronTriggerArgs): CronTrigger => {
            return {
                type: 'cron',
                expression: args.expression,
                handler: args.handler,
            }
        },
        onWebhook: <TBody = any>(args: WebhookTriggerArgs<TBody>): WebhookTrigger<TBody> => {
            return {
                type: 'webhook',
                handler: args.handler,
                path: args.path,
                method: args.method || 'POST',
                setup: args.setup,
                teardown: args.teardown,
            }
        }
    }
}
