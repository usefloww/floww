# KV Store Example

This example demonstrates how to use the Floww KV Store for persistent data storage across workflow executions.

## Features Demonstrated

1. **User Management** - CRUD operations for user data
2. **Session Management** - Storing and managing user sessions
3. **Simple Counter** - Incrementing values with get/set pattern
4. **Cache Pattern** - Implementing a time-based cache with expiration

## Running the Example

```bash
# Install dependencies
pnpm install

# Run locally (requires local backend at http://localhost:8000)
pnpm floww-local dev

# Run with production backend
pnpm floww dev
```

## Testing the Endpoints

### 1. User Management (`/users`)

**Create a user:**
```bash
curl -X POST http://localhost:3000/webhook/users \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create-user",
    "userId": "user-123",
    "name": "John Doe",
    "email": "john@example.com"
  }'
```

**Get a user:**
```bash
curl -X POST http://localhost:3000/webhook/users \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get-user",
    "userId": "user-123"
  }'
```

**Update a user:**
```bash
curl -X POST http://localhost:3000/webhook/users \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update-user",
    "userId": "user-123",
    "name": "Jane Doe",
    "email": "jane@example.com"
  }'
```

**Delete a user:**
```bash
curl -X POST http://localhost:3000/webhook/users \
  -H "Content-Type: application/json" \
  -d '{
    "action": "delete-user",
    "userId": "user-123"
  }'
```

**List all users:**
```bash
curl -X POST http://localhost:3000/webhook/users \
  -H "Content-Type: application/json" \
  -d '{"action": "list-users"}'
```

**List all tables:**
```bash
curl -X POST http://localhost:3000/webhook/users \
  -H "Content-Type: application/json" \
  -d '{"action": "list-tables"}'
```

### 2. Session Management (`/sessions/create`)

```bash
curl -X POST http://localhost:3000/webhook/sessions/create \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "sess-abc123",
    "userId": "user-123",
    "ipAddress": "192.168.1.1"
  }'
```

### 3. Page View Counter (`/counter`)

```bash
# Increment by 1 (default)
curl -X POST http://localhost:3000/webhook/counter \
  -H "Content-Type: application/json" \
  -d '{}'

# Increment by custom amount
curl -X POST http://localhost:3000/webhook/counter \
  -H "Content-Type: application/json" \
  -d '{"increment": 5}'
```

### 4. Cache Pattern (`/cache`)

```bash
# Get/set cached data
curl -X POST http://localhost:3000/webhook/cache \
  -H "Content-Type: application/json" \
  -d '{"key": "api-response"}'

# Invalidate cache
curl -X POST http://localhost:3000/webhook/cache \
  -H "Content-Type: application/json" \
  -d '{"key": "api-response", "invalidate": true}'
```

## KV Store Concepts

### Tables and Keys

The KV Store organizes data into **tables** (namespaces) and **keys**:

```typescript
await ctx.kv.set("users", "user-123", userData);
//                 ↑         ↑           ↑
//              table      key        value
```

### Type Safety

Use TypeScript generics for type-safe operations:

```typescript
type User = {
  id: string;
  name: string;
  email: string;
};

// Set with type
await ctx.kv.set<User>("users", "user-123", user);

// Get with type
const user = await ctx.kv.get<User>("users", "user-123");
// user is typed as User
```

### Error Handling

Always handle errors when working with KV Store:

```typescript
import { KVError } from "floww";

try {
  const value = await ctx.kv.get("table", "key");
} catch (error) {
  if (error instanceof KVError) {
    if (error.statusCode === 404) {
      console.log("Key not found");
    } else if (error.statusCode === 403) {
      console.log("Permission denied");
    }
  }
}
```

### Available Operations

- `ctx.kv.set(table, key, value)` - Store a value
- `ctx.kv.get(table, key)` - Retrieve a value
- `ctx.kv.delete(table, key)` - Delete a value
- `ctx.kv.listTables()` - List all tables
- `ctx.kv.listKeys(table)` - List keys in a table
- `ctx.kv.listItems(table)` - List keys with their values
- `ctx.kv.listPermissions(table)` - List permissions for a table
- `ctx.kv.grantPermission(table, workflowId, options)` - Grant access to another workflow
- `ctx.kv.revokePermission(table, workflowId)` - Revoke access

## Use Cases

1. **User Data** - Store user profiles, preferences, settings
2. **Session Storage** - Manage authentication sessions
3. **Cache** - Cache expensive API responses or computations
4. **Counters** - Track metrics, page views, API usage
5. **Workflow State** - Persist state between workflow executions
6. **Configuration** - Store dynamic configuration data
7. **Inter-workflow Communication** - Share data between workflows using permissions

## Best Practices

1. **Use meaningful table names** - Organize related data in the same table
2. **Handle errors gracefully** - Always catch and handle KV errors
3. **Use type safety** - Define TypeScript types for your data
4. **Consider data size** - Keep values under 1MB
5. **Clean up old data** - Implement cleanup logic for expired/stale data
6. **Use unique keys** - Ensure keys are unique within a table
7. **Plan your data model** - Think about how you'll query and organize data
