import { Handler, WebhookEvent, WebhookContext } from "../../common";
import { BaseProvider, BaseProviderConfig } from "../base";
import { registerTrigger } from "../../userCode/providers";

export type GoogleCalendarConfig = BaseProviderConfig;

// ============================================================================
// Event Types
// ============================================================================

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status?: string;
  htmlLink?: string;
  created?: string;
  updated?: string;
  creator?: {
    email?: string;
    displayName?: string;
  };
  organizer?: {
    email?: string;
    displayName?: string;
  };
  attendees?: Array<{
    email?: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  recurringEventId?: string;
}

export interface CalendarEventCreatedEvent {
  type: "event_created";
  calendar_id: string;
  event: CalendarEvent;
}

export interface CalendarEventUpdatedEvent {
  type: "event_updated";
  calendar_id: string;
  event: CalendarEvent;
}

// ============================================================================
// Trigger Args Types
// ============================================================================

export type GoogleCalendarOnEventCreatedArgs = {
  calendarId?: string; // Default: "primary"
  handler: Handler<WebhookEvent<CalendarEventCreatedEvent>, WebhookContext>;
};

export type GoogleCalendarOnEventUpdatedArgs = {
  calendarId?: string; // Default: "primary"
  handler: Handler<WebhookEvent<CalendarEventUpdatedEvent>, WebhookContext>;
};

// ============================================================================
// Google Calendar Provider Class
// ============================================================================

/**
 * Google Calendar Provider
 *
 * Provides integration with Google Calendar API.
 * Uses OAuth2 authentication and polling-based triggers
 * (since push notifications require a verified domain).
 *
 * @example
 * ```typescript
 * import { GoogleCalendar } from "floww";
 *
 * const calendar = new GoogleCalendar();
 *
 * calendar.triggers.onEventCreated({
 *   calendarId: "primary",
 *   handler: async (event, ctx) => {
 *     console.log("New event:", event.data.event.summary);
 *   },
 * });
 * ```
 */
export class GoogleCalendar extends BaseProvider {
  constructor(config?: GoogleCalendarConfig | string) {
    super("google_calendar", config);
  }

  triggers = {
    onEventCreated: (args: GoogleCalendarOnEventCreatedArgs) => {
      return registerTrigger(
        {
          type: "polling",
          handler: args.handler,
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onEventCreated",
          input: {
            calendar_id: args.calendarId ?? "primary",
          },
        }
      );
    },

    onEventUpdated: (args: GoogleCalendarOnEventUpdatedArgs) => {
      return registerTrigger(
        {
          type: "polling",
          handler: args.handler,
        },
        {
          type: this.providerType,
          alias: this.credentialName,
          triggerType: "onEventUpdated",
          input: {
            calendar_id: args.calendarId ?? "primary",
          },
        }
      );
    },
  };

  // No actions for now - provider is read-only with calendar.readonly scope
  actions = {};
}
