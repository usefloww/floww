import { Provider, WebhookTrigger, Handler, WebhookEvent, WebhookContext } from "../common";

// Google Calendar event types
export type GoogleCalendarEventCreateEvent = {
    kind: 'calendar#event';
    id: string;
    summary: string;
    description?: string;
    start: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    end: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    attendees?: Array<{
        email: string;
        displayName?: string;
        responseStatus: string;
    }>;
}

export type GoogleCalendarEventCreateTriggerArgs = {
    calendarId: string;
    handler: Handler<WebhookEvent<GoogleCalendarEventCreateEvent>, WebhookContext>;
}

export class GoogleCalendar implements Provider {
    private email: string;

    constructor(email: string) {
        this.email = email;
    }

    triggers = {
        onEventCreate: (args: GoogleCalendarEventCreateTriggerArgs): WebhookTrigger<GoogleCalendarEventCreateEvent> => {
            return {
                type: 'webhook',
                handler: args.handler,
                path: '/webhooks/google-calendar/event-create',
                method: 'POST',
                setup: async (ctx) => {
                    // TODO: Register webhook with Google Calendar API
                    console.log('Register Google Calendar webhook at:', ctx.webhookUrl);
                }
            }
        }
    }

    actions = {}
}
