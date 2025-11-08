# ExecutionContext - Internal Context Propagation

## Overview

The `ExecutionContext` system provides automatic propagation of internal data (like auth tokens, workflow IDs) through the SDK without exposing sensitive information to user code.

## Problem Solved

**Before**: Adding contextual data (like auth tokens) required manual changes in multiple places:
- Extract data from events manually
- Pass it through every service constructor
- Reconstruct objects with specific fields each time
- No easy way to add new contextual fields

**After**: Set contextual data once, and it's automatically available to all services.

## Architecture

### Components

1. **ExecutionContext** (`sdk/src/cli/runtime/ExecutionContext.ts`)
   - Stores internal data per-event (isolated, no shared state)
   - Provides typed accessors for well-known fields (authToken, workflowId)
   - Supports arbitrary key-value pairs for extensibility

2. **EventRouter** (`sdk/src/cli/runtime/EventRouter.ts`)
   - Extracts context from each event automatically
   - Creates fresh ExecutionContext per event
   - Passes context to services (like KVStore)

3. **Services** (e.g., `sdk/src/kv/client.ts`)
   - Receive ExecutionContext in constructor
   - Access internal data without exposing to user code

## How It Works

### Data Flow

```
Backend sends event via WebSocket
    ↓
WebSocketEventProducer receives event with auth_token (workflow JWT)
    ↓
Event emitted: { type: "webhook", trigger: ..., data: { ..., auth_token: "..." } }
    ↓
EventRouter receives event
    ↓
ExecutionContext.fromEvent(event.data)  // Extracts auth_token → authToken
    ↓
EventRouter.createContext(event.data)
    ↓
If no auth_token from event → Fall back to CLI user's token (dev mode)
    ↓
new KVStore(url, executionContext)  // Context passed to service
    ↓
kv.request() → context.getAuthToken()  // Service uses auth token for backend API
```

### Auth Token Fallback (Dev Mode)

In **dev mode**, the backend may not send a workflow-specific JWT (or it may be missing `deployment_id`).
The EventRouter automatically falls back to using the CLI user's authentication token:

```typescript
// In EventRouter.createContext()
if (!executionContext.getAuthToken()) {
  const cliToken = await getAuthToken(); // CLI user's token
  if (cliToken) {
    executionContext.setAuthToken(cliToken);
  }
}
```

This ensures KV store operations work seamlessly in dev mode using the developer's credentials.

### Per-Event Isolation

Each event gets a **fresh ExecutionContext**:
- No shared state between events
- Auth tokens scoped to specific event
- Prevents data leakage

```typescript
// Event 1
webhook event { auth_token: "token-A" }
→ ExecutionContext { authToken: "token-A" }

// Event 2 (separate, isolated)
webhook event { auth_token: "token-B" }
→ ExecutionContext { authToken: "token-B" }
```

## Usage

### For SDK Users (No Changes Required!)

User code remains unchanged. Context propagation is completely transparent:

```typescript
builtin.triggers.onWebhook({
  handler: async (ctx, event) => {
    // Auth token is automatically available to ctx.kv
    const user = await ctx.kv.get("users", event.body.userId);

    // No need to pass auth token manually!
  },
  path: "/users",
});
```

### For Service Implementers

When creating a new service that needs internal context:

```typescript
import type { ExecutionContext } from 'floww';

export class MyService {
  constructor(
    private backendUrl: string,
    private context: ExecutionContext
  ) {}

  async doSomething() {
    const authToken = this.context.getAuthToken();
    const workflowId = this.context.getWorkflowId();

    // Use in API calls
    await fetch(this.backendUrl, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Workflow-ID': workflowId,
      },
    });
  }
}
```

Then in EventRouter's `createContext()`:

```typescript
private createContext(event?: any): Context {
  const config = getConfig();
  const executionContext = ExecutionContext.fromEvent(event);

  const kv = new KVStore(config.backendUrl, executionContext);
  const myService = new MyService(config.backendUrl, executionContext);

  return { kv, myService };
}
```

## Adding New Context Fields

To add a new contextual field (e.g., user ID):

1. Update `ExecutionContext.fromEvent()`:

```typescript
static fromEvent(event: any): ExecutionContext {
  const contextData: ExecutionContextData = {};

  if (event?.auth_token) {
    contextData.authToken = event.auth_token;
  }

  if (event?.workflow_id) {
    contextData.workflowId = event.workflow_id;
  }

  // Add new field mapping
  if (event?.user_id) {
    contextData.userId = event.user_id;
  }

  return new ExecutionContext(contextData);
}
```

2. (Optional) Add typed accessor:

```typescript
export class ExecutionContext {
  getUserId(): string | undefined {
    return this.data.userId;
  }

  setUserId(id: string): void {
    this.data.userId = id;
  }
}
```

3. Services automatically have access:

```typescript
const userId = this.context.getUserId();
// or
const userId = this.context.get('userId');
```

**That's it!** No changes needed in EventRouter, services, or user code.

## Benefits

✅ **Security**: Auth tokens hidden from user code
✅ **Simplicity**: Set once, available everywhere
✅ **Extensibility**: Easy to add new contextual fields
✅ **Isolation**: Per-event contexts prevent data leakage
✅ **Testability**: Constructor injection for easy mocking
✅ **Type Safety**: Well-known fields have typed accessors
✅ **Backward Compatible**: Existing code works without changes

## Example: Before vs After

### Before (Manual Propagation)

```typescript
// EventRouter
private createContext(authToken?: string) {
  const kv = new KVStore(config.backendUrl, authToken || '');
  return { kv };
}

// In routing
const ctx = this.createContext(event.data?.auth_token);
```

**Problem**: Adding a new field (like workflow_id) requires:
- Update `createContext()` signature
- Update all `createContext()` calls
- Update all service constructors
- Pass new field through every layer

### After (Automatic Propagation)

```typescript
// EventRouter
private createContext(event?: any) {
  const executionContext = ExecutionContext.fromEvent(event);
  const kv = new KVStore(config.backendUrl, executionContext);
  return { kv };
}

// In routing
const ctx = this.createContext(event.data);
```

**Solution**: Adding a new field only requires updating `ExecutionContext.fromEvent()`.

## Testing

See `ExecutionContext.test.ts` for comprehensive test coverage:
- Basic operations (get/set)
- Event extraction
- Data isolation
- Extensibility
- Type safety
