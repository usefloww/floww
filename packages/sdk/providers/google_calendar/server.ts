import { z } from "zod";
import type {
  ProviderDefinition,
  TriggerDefinition,
  SetupStep,
} from "../base";

// ============================================================================
// Provider Secrets Type
// ============================================================================

interface GoogleCalendarSecrets {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}

// ============================================================================
// Setup Steps
// ============================================================================

const setupSteps: SetupStep[] = [
  {
    type: "oauth",
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    description: "Connect your Google account to access calendars",
  },
];

// ============================================================================
// Input and State Schemas
// ============================================================================

const OnEventCreatedInputSchema = z.object({
  calendar_id: z.string().default("primary"),
});

const OnEventCreatedStateSchema = z.object({
  calendar_id: z.string(),
  sync_token: z.string().nullable(),
});

const OnEventUpdatedInputSchema = z.object({
  calendar_id: z.string().default("primary"),
});

const OnEventUpdatedStateSchema = z.object({
  calendar_id: z.string(),
  sync_token: z.string().nullable(),
});

// Type aliases
type OnEventCreatedInput = z.infer<typeof OnEventCreatedInputSchema>;
type OnEventCreatedState = z.infer<typeof OnEventCreatedStateSchema>;
type OnEventUpdatedInput = z.infer<typeof OnEventUpdatedInputSchema>;
type OnEventUpdatedState = z.infer<typeof OnEventUpdatedStateSchema>;

// ============================================================================
// Trigger Definitions
// ============================================================================

/**
 * Trigger for new Google Calendar events.
 *
 * Uses polling via recurring tasks since Google Calendar push notifications
 * require a verified domain and public HTTPS endpoint.
 */
const onEventCreatedTrigger: TriggerDefinition<
  OnEventCreatedInput,
  OnEventCreatedState,
  GoogleCalendarSecrets
> = {
  inputSchema: OnEventCreatedInputSchema,
  stateSchema: OnEventCreatedStateSchema,
  lifecycle: {
    async create(ctx) {
      // Store initial state - sync token will be populated on first poll
      return {
        calendar_id: ctx.input.calendar_id,
        sync_token: null,
      };
    },
    async destroy(_ctx) {
      // No external cleanup needed - recurring task is managed by the backend
    },
    async refresh(ctx) {
      return ctx.state;
    },
  },
};

/**
 * Trigger for updated Google Calendar events.
 *
 * Uses polling via recurring tasks.
 */
const onEventUpdatedTrigger: TriggerDefinition<
  OnEventUpdatedInput,
  OnEventUpdatedState,
  GoogleCalendarSecrets
> = {
  inputSchema: OnEventUpdatedInputSchema,
  stateSchema: OnEventUpdatedStateSchema,
  lifecycle: {
    async create(ctx) {
      return {
        calendar_id: ctx.input.calendar_id,
        sync_token: null,
      };
    },
    async destroy(_ctx) {
      // No external cleanup needed
    },
    async refresh(ctx) {
      return ctx.state;
    },
  },
};

// ============================================================================
// Provider Definition
// ============================================================================

export const GoogleCalendarServerProvider: ProviderDefinition<GoogleCalendarSecrets> =
  {
    providerType: "google_calendar",
    setupSteps,
    // No webhook processor - uses polling instead
    triggerDefinitions: {
      onEventCreated: onEventCreatedTrigger as TriggerDefinition<
        unknown,
        unknown,
        GoogleCalendarSecrets
      >,
      onEventUpdated: onEventUpdatedTrigger as TriggerDefinition<
        unknown,
        unknown,
        GoogleCalendarSecrets
      >,
    },
  };
