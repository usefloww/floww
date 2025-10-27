import {
  WebhookTrigger,
  Handler,
  WebhookEvent,
  WebhookContext,
  WebhookSetupContext,
} from "../common";
import { BaseProvider, BaseProviderConfig } from "./base";
import { registerTrigger } from "../userCode/providers";

export type GoogleCalendarConfig = BaseProviderConfig & {
  timezone?: string; // Default timezone for calendar operations
};

// Google Calendar event types
export type GoogleCalendarEventCreateEvent = {
  kind: "calendar#event";
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
};

export type GoogleCalendarEventCreateTriggerArgs = {
  calendarId: string;
  handler: Handler<
    WebhookEvent<GoogleCalendarEventCreateEvent>,
    WebhookContext
  >;
};

export class GoogleCalendar extends BaseProvider {
  providerType = "googleCalendar";

  secretDefinitions = [
    {
      key: "email",
      label: "Google Calendar Email",
      type: "string" as const,
      required: true,
    },
    {
      key: "clientId",
      label: "Google OAuth Client ID",
      type: "string" as const,
      required: true,
    },
    {
      key: "clientSecret",
      label: "Google OAuth Client Secret",
      type: "password" as const,
      required: true,
    },
  ];

  constructor(config?: GoogleCalendarConfig | string) {
    super(config);
  }

  private getTimezone(): string {
    return this.getConfig<string>("timezone", "UTC") || "UTC";
  }

  triggers = {
    onEventCreate: (
      args: GoogleCalendarEventCreateTriggerArgs,
    ): WebhookTrigger<GoogleCalendarEventCreateEvent> => {
      return registerTrigger({
        type: "webhook",
        handler: args.handler,
        // Path will be auto-generated as /webhook/{uuid}
        method: "POST",
        setup: async (ctx: WebhookSetupContext) => {
          // TODO: Register webhook with Google Calendar API
          const email = this.getSecret("email");
          const clientId = this.getSecret("clientId");
          const timezone = this.getTimezone();
          console.log("Register Google Calendar webhook at:", ctx.webhookUrl);
          console.log("For calendar:", email);
          console.log("Timezone:", timezone);
        },
      });
    },
  };

  actions = {};
}
