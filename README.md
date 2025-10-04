# Floww SDK

SDK for building trigger-based workflows with dynamic TypeScript code execution.

## Features

- **Dynamic Code Execution**: Execute TypeScript code at runtime with full module support
- **Virtual File System**: Multi-file projects with import/export resolution
- **Webhook Triggers**: Handle HTTP webhooks with custom paths and validation
- **Cron Triggers**: Schedule tasks with cron expressions
- **Auto-reload**: Development mode with automatic file watching
- **TypeScript Support**: Full TypeScript transpilation with type checking
- **Error Handling**: Meaningful stack traces with original file references
- **Async/Await**: Full Promise support for asynchronous operations
- **JSON Imports**: Native support for importing JSON configuration files
- **Built-in Providers**: Builtin, GitLab, Google Calendar integrations

## Installation

### From GitHub Package Registry

```bash
# Configure npm to use GitHub Package Registry for @developerflows scope
echo "@developerflows:registry=https://npm.pkg.github.com" >> .npmrc

# Install the package
npm install @developerflows/floww-sdk
```

### Authentication

For private repositories, you'll need a GitHub Personal Access Token:

```bash
# Create .npmrc in your project root
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> .npmrc
```

## Usage

### Dynamic Code Execution

#### Basic Example

```typescript
import { executeUserProject } from '@developerflows/floww-sdk';

const files = {
  "main.ts": `
    import { add } from "./utils";
    export const handler = () => {
      return add(1, 2);
    }
  `,
  "utils.ts": "export const add = (a: number, b: number) => a + b;"
};

const result = await executeUserProject({
  files,
  entryPoint: "main.handler"
});

console.log(result); // 3
```

#### Multi-file Project

```typescript
const files = {
  "src/index.ts": `
    import { Calculator } from "./math/calculator";
    import config from "./config.json";

    export const handler = async () => {
      const calc = new Calculator();
      return calc.multiply(config.baseValue, 5);
    }
  `,
  "src/math/calculator.ts": `
    export class Calculator {
      multiply(a: number, b: number): number {
        return a * b;
      }
    }
  `,
  "src/config.json": `{
    "baseValue": 10
  }`
};

const result = await executeUserProject({
  files,
  entryPoint: "src/index.handler"
});
```

#### Async Operations

```typescript
const files = {
  "async-main.ts": `
    export const handler = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return "async complete";
    }
  `
};

const result = await executeUserProject({
  files,
  entryPoint: "async-main.handler"
});
```

### Trigger-based Workflows

#### Quick Start

**1. Create a workflow file**

Create a file `main.ts` with your triggers:

```typescript
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
```

**2. Run in development mode**

```bash
# Using the global command (if installed)
floww dev main.ts

# Or using pnpm script
pnpm floww dev main.ts

# With custom port/host
pnpm floww dev main.ts --port 8080 --host 0.0.0.0
```

**3. Test your webhook**

```bash
curl -X POST http://localhost:3000/webhooks/custom \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello World"}'
```

## CLI Commands

### `floww dev <file>`

Run triggers in development mode with auto-reload on file changes.

**Options:**
- `-p, --port <port>` - Port for webhook server (default: 3000)
- `-h, --host <host>` - Host for webhook server (default: localhost)

**Example:**
```bash
pnpm floww dev examples/main.ts
```

### `floww start <file>`

Run triggers in production mode.

**Options:**
- `-p, --port <port>` - Port for webhook server (default: 3000)
- `-h, --host <host>` - Host for webhook server (default: 0.0.0.0)

**Example:**
```bash
pnpm floww start examples/main.ts --port 8080
```

## Publishing Strategy

This package uses different versioning strategies based on the branch:

- **`main` branch**: Patch versions (1.0.1, 1.0.2, etc.)
- **`develop` branch**: Alpha prereleases (1.0.1-alpha.1, etc.)
- **`feature/*` branches**: Beta prereleases (1.0.1-beta.1, etc.) with branch-specific package names
- **Other branches**: RC prereleases (1.0.1-rc.1, etc.)

### Installing Different Versions

```bash
# Latest stable release
npm install @developerflows/floww-sdk

# Alpha version from develop branch
npm install @developerflows/floww-sdk@alpha

# Beta version from feature branch
npm install @developerflows/floww-sdk@beta

# Specific feature branch
npm install @developerflows/floww-sdk-feature-new-feature@beta
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm run test:ci

# Build package
pnpm run build

# Run in development mode
pnpm run dev
```

## Triggers

### Webhook Trigger

Handle HTTP webhooks with custom paths and optional validation.

```typescript
builtin.triggers.onWebhook<TBody>({
  handler: (ctx, event) => {
    // event.body - Request body (typed as TBody)
    // event.headers - Request headers
    // event.query - Query parameters
    // event.method - HTTP method
    // event.path - Request path
  },
  path: '/custom',              // Webhook path (will be available at /webhooks/custom)
  method: 'POST',               // HTTP method (default: POST)
  validation: async (event) => { // Optional validation function
    return event.headers['x-token'] === 'secret';
  }
})
```

### Cron Trigger

Schedule tasks with cron expressions.

```typescript
builtin.triggers.onCron({
  expression: "*/5 * * * * *",  // Every 5 seconds
  handler: (ctx, event) => {
    // Runs on schedule
  }
})
```

**Cron Expression Format:**
```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └─ Day of week (0-7, 0 and 7 are Sunday)
│ │ │ │ └─── Month (1-12)
│ │ │ └───── Day of month (1-31)
│ │ └─────── Hour (0-23)
│ └───────── Minute (0-59)
└─────────── Second (0-59, optional)
```

## Providers

### Builtin

Basic triggers included in the SDK.

```typescript
import { Builtin } from "@developerflows/floww-sdk";
const builtin = new Builtin();
```

### GitLab

GitLab integration for webhooks and events.

```typescript
import { Gitlab } from "@developerflows/floww-sdk";
const gitlab = new Gitlab('your-access-token');
```

### Google Calendar

Google Calendar integration.

```typescript
import { GoogleCalendar } from "@developerflows/floww-sdk";
const calendar = new GoogleCalendar('user@example.com');
```

## API Reference

### `executeUserProject(options)`

Executes a TypeScript project in a virtual environment.

#### Parameters

- `options.files`: Record<string, string> - Object mapping file paths to their content
- `options.entryPoint`: string - Entry point in format "filename.exportName" or just "filename"

#### Returns

Promise<any> - The result of executing the entry point function

#### Example Entry Points

```typescript
// For: export const handler = () => {...}
entryPoint: "main.handler"

// For: export default function() {...}
entryPoint: "main"

// For: module.exports = function() {...}
entryPoint: "index"
```

## License

ISC

