# Floww SDK

Build event-driven workflows with TypeScript. Trigger code execution from webhooks, cron schedules, and external services.

## Quick Start

```bash
npm install floww
```

Create a workflow file `main.ts`:

```typescript
import { getProvider } from "floww";

const builtin = getProvider("builtin");

builtin.triggers.onCron({
  expression: "*/1 * * * * *",  // Every second
  handler: (ctx, event) => {
    console.log("Triggered at", event.scheduledTime);
  },
});
```

Run your workflow:

```bash
npx floww dev
```

## Features

- **Webhook Triggers** - Handle HTTP requests with custom paths and validation
- **Cron Scheduling** - Run tasks on schedules using cron expressions
- **TypeScript Native** - Full TypeScript support with type checking
- **Auto-reload** - Hot reload in development mode
- **Provider System** - Built-in integrations for GitLab, Google Calendar, and more

## Basic Usage

### Webhook Trigger

```typescript
import { getProvider } from "floww-sdk";

const builtin = getProvider("builtin");

builtin.triggers.onWebhook({
  path: '/custom',
  handler: (ctx, event) => {
    console.log('Received:', event.body);
    return { success: true };
  },
});
```

Test it:
```bash
curl -X POST http://localhost:3000/webhooks/custom \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

### Cron Trigger

```typescript
builtin.triggers.onCron({
  expression: "0 9 * * 1-5",  // Weekdays at 9 AM
  handler: (ctx, event) => {
    console.log('Daily task running');
  }
});
```

### Multiple Triggers

Export an array of triggers from your workflow file:

```typescript
import { getProvider } from "floww-sdk";

const builtin = getProvider("builtin");

export default [
  builtin.triggers.onWebhook({
    path: '/deploy',
    handler: async (ctx, event) => {
      // Handle deployments
    },
  }),

  builtin.triggers.onCron({
    expression: "0 */2 * * *",  // Every 2 hours
    handler: async (ctx, event) => {
      // Cleanup tasks
    },
  }),
];
```

## CLI Commands

### Development Mode

```bash
floww dev [file]        # Run with auto-reload (default: main.ts)
floww dev --port 8080   # Custom port
```

### Production Mode

```bash
floww start [file]      # Run in production
```

### Deploy

```bash
floww deploy            # Deploy to Floww cloud
```

## Providers

### GitLab

```typescript
import { getProvider } from "floww-sdk";

const gitlab = getProvider("gitlab", {
  token: process.env.GITLAB_TOKEN
});

gitlab.triggers.onPushEvent({
  handler: (ctx, event) => {
    console.log('Push to', event.ref);
  }
});
```

### Google Calendar

```typescript
import { getProvider } from "floww-sdk";

const calendar = getProvider("google_calendar", {
  email: "user@example.com"
});

calendar.triggers.onEventStart({
  handler: (ctx, event) => {
    console.log('Event starting:', event.title);
  }
});
```

## Documentation

For detailed documentation, visit [usefloww.dev](https://usefloww.dev)

- [Quick Start Guide](https://usefloww.dev/docs/getting-started/quick-start)
- [Running Locally](https://usefloww.dev/docs/running-locally)
- [All Providers](https://usefloww.dev/docs/providers)
- [Architecture](https://usefloww.dev/docs/advanced/architecture)
