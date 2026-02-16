# SDK E2E Tests

This directory contains end-to-end tests that test the floww-sdk against the Flow Dashboard's API routes without needing a real HTTP server.

## Overview

These tests validate that the SDK correctly integrates with the Dashboard's backend by:
- Using real SDK code (from `packages/sdk`)
- Calling real API route handlers (not mocked)
- Using real database operations (with transaction-based rollback)
- Testing full request/response serialization

## How It Works

### Architecture

```
┌─────────────┐
│  SDK Test   │
└──────┬──────┘
       │ SDK API call (via TokenApiClient)
       ↓
┌──────────────────┐
│ SDK Test Adapter │  ← Intercepts node-fetch
└──────┬───────────┘
       │ Converts to Request object
       ↓
┌──────────────────┐
│ handleApiRequest │  ← Dashboard API router
└──────┬───────────┘
       │ Routes to handler
       ↓
┌──────────────────┐
│  API Handler     │  ← Real route handler
└──────┬───────────┘
       │ Database operations
       ↓
┌──────────────────┐
│  Test Database   │  ← Transaction-based rollback
└──────────────────┘
```

### Key Components

1. **SDK Test Adapter** (`tests/helpers/sdk-test-adapter.ts`)
   - Mocks `node-fetch` to intercept SDK HTTP calls
   - Routes requests directly to Dashboard API handlers
   - Preserves request/response serialization

2. **SDK Test Helpers** (`tests/helpers/sdk-helpers.ts`)
   - Factory functions for creating service accounts with API keys
   - Utilities for configuring SDK clients
   - Setup/teardown helpers

3. **Test Suites** (`tests/e2e/sdk/*.test.ts`)
   - `auth.test.ts` - Authentication and authorization
   - `workflows.test.ts` - Workflow CRUD operations
   - `namespaces.test.ts` - Namespace access and permissions
   - `dev-mode.test.ts` - Dev mode trigger syncing
   - `deployments.test.ts` - Runtime and deployment operations

## Running the Tests

### Run all SDK e2e tests

```bash
pnpm test tests/e2e/sdk
```

### Run a specific test suite

```bash
pnpm test tests/e2e/sdk/auth.test.ts
pnpm test tests/e2e/sdk/workflows.test.ts
```

### Run with verbose output

```bash
pnpm test tests/e2e/sdk --reporter=verbose
```

## Writing SDK E2E Tests

### Basic Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupSdkTestEnvironment, teardownSdkTestEnvironment } from '../../helpers/sdk-test-adapter';
import { setupSdkTest, teardownSdkTest } from '../../helpers/sdk-helpers';
import { createTestOrganization } from '../../helpers/factories';

beforeAll(() => {
  setupSdkTestEnvironment();
});

afterAll(() => {
  teardownSdkTestEnvironment();
  teardownSdkTest();
});

describe('My SDK Feature', () => {
  it('should work correctly', async () => {
    // Setup
    const org = await createTestOrganization();
    const { client, serviceAccount } = await setupSdkTest({
      organizationId: org.id
    });

    // Execute
    const response = await client.apiCall('/some-endpoint');

    // Verify
    expect(response).toMatchObject({
      // expected structure
    });
  });
});
```

### Using Service Accounts

Service accounts are automatically created with API keys:

```typescript
import { createTestServiceAccount } from '../../helpers/sdk-helpers';

// Create service account in an organization
const org = await createTestOrganization();
const serviceAccount = await createTestServiceAccount(org.id);

// Use the service account with SDK
const { TokenApiClient } = await import('~/packages/sdk/cli/api/TokenApiClient');
const client = new TokenApiClient('http://localhost:3000', serviceAccount.apiKey);

// Make API calls
const response = await client.apiCall('/whoami');
```

### Testing Access Control

```typescript
it('should deny access to other organizations', async () => {
  const org1 = await createTestOrganization();
  const org2 = await createTestOrganization();

  const namespace2 = await createTestNamespace({ organizationId: org2.id });

  // Service account only in org1
  const { client } = await setupSdkTest({ organizationId: org1.id });

  // Should not be able to access org2's namespace
  await expect(
    client.apiCall(`/namespaces/${namespace2.id}`)
  ).rejects.toThrow(/not found/);
});
```

### Testing Database State

You can verify database state directly:

```typescript
import { getTestDb } from '../../setup/global-setup';
import { workflows } from '~/server/db/schema';
import { eq } from 'drizzle-orm';

it('should create workflow in database', async () => {
  const { client } = await setupSdkTest({ organizationId: org.id });

  const response = await client.apiCall('/workflows', {
    method: 'POST',
    body: {
      namespaceId: namespace.id,
      name: 'Test Workflow',
    },
  });

  // Verify in database
  const [workflow] = await getTestDb()
    .select()
    .from(workflows)
    .where(eq(workflows.id, response.id));

  expect(workflow.name).toBe('Test Workflow');
});
```

## Best Practices

### 1. Use Transaction Rollback

All tests run in transactions that automatically roll back after each test. This ensures:
- Clean test isolation
- No test data pollution
- Fast test execution

### 2. Test Real Integration

Don't mock the SDK or API handlers. These tests are meant to catch integration issues:
- Serialization/deserialization bugs
- Authentication/authorization issues
- Data validation problems
- API contract mismatches

### 3. Test Access Control

Always test that users can only access resources they're authorized for:

```typescript
it('should respect organization boundaries', async () => {
  const org1 = await createTestOrganization();
  const org2 = await createTestOrganization();

  const resource2 = await createResourceInOrg(org2.id);
  const { client } = await setupSdkTest({ organizationId: org1.id });

  await expect(
    client.apiCall(`/resources/${resource2.id}`)
  ).rejects.toThrow();
});
```

### 4. Test Error Cases

Test how the SDK handles various error responses:

```typescript
it('should handle validation errors', async () => {
  const { client } = await setupSdkTest({ organizationId: org.id });

  await expect(
    client.apiCall('/workflows', {
      method: 'POST',
      body: {
        // Missing required fields
        name: '',
      },
    })
  ).rejects.toThrow(/required/);
});
```

### 5. Test Pagination

For list endpoints, test pagination:

```typescript
it('should support pagination', async () => {
  // Create test data
  for (let i = 0; i < 10; i++) {
    await createTestWorkflow(namespace.id);
  }

  const { client } = await setupSdkTest({ organizationId: org.id });

  const page1 = await client.apiCall('/workflows?limit=5&offset=0');
  expect(page1.results).toHaveLength(5);

  const page2 = await client.apiCall('/workflows?limit=5&offset=5');
  expect(page2.results).toHaveLength(5);

  // Verify no duplicates
  const allIds = [
    ...page1.results.map(w => w.id),
    ...page2.results.map(w => w.id),
  ];
  expect(new Set(allIds).size).toBe(10);
});
```

## Debugging

### Enable Verbose Logging

Set environment variables to see more details:

```bash
DEBUG=* pnpm test tests/e2e/sdk
```

### Inspect Database State

If a test is failing, you can inspect the database state within the test:

```typescript
it('debug test', async () => {
  const { client } = await setupSdkTest({ organizationId: org.id });

  // Make SDK call
  await client.apiCall('/workflows', { method: 'POST', body: {...} });

  // Inspect database
  const db = getTestDb();
  const allWorkflows = await db.select().from(workflows);
  console.log('All workflows:', allWorkflows);
});
```

### Check Transaction Rollback

If you suspect transaction rollback isn't working:

```typescript
it('verify rollback', async () => {
  const db = getTestDb();

  const beforeCount = await db.select().from(workflows);

  await createTestWorkflow(namespace.id);

  const duringCount = await db.select().from(workflows);
  expect(duringCount.length).toBe(beforeCount.length + 1);

  // After test completes, count should reset to beforeCount
});
```

## Common Issues

### Import Errors

If you see errors like `Cannot find module '~/packages/sdk/cli/api/TokenApiClient'`:

- Ensure the vitest config has the `~` alias configured to point to the root
- Verify the `packages/sdk` directory exists
- Run `pnpm install` in the root directory if dependencies are missing

### Authentication Failures

If tests fail with authentication errors:

- Check that service account is created with valid API key
- Verify the API key is being passed correctly to the SDK client
- Ensure the test adapter is intercepting fetch calls

### Database State Issues

If tests interfere with each other:

- Verify that `singleFork: true` is set in vitest config
- Check that tests aren't creating data outside transactions
- Ensure proper cleanup in afterEach hooks if needed

## Architecture Decisions

### Why Direct Handler Calls?

We chose to route SDK calls directly to API handlers (rather than starting a real HTTP server) because:

1. **Faster**: No HTTP overhead, tests run in milliseconds
2. **Simpler**: Single process, easier to debug
3. **Comprehensive**: Still tests routing, auth, serialization
4. **Isolated**: No port conflicts or network issues

### Why Not Mock?

We use real API handlers (not mocks) because:

1. **Integration Testing**: Catches real integration bugs
2. **API Contract**: Ensures SDK matches actual API behavior
3. **Refactoring Safety**: Tests break when API changes
4. **Confidence**: Higher confidence in production behavior

### Why Service Accounts?

We use service accounts for testing because:

1. **Simplicity**: Easier than managing user sessions
2. **Consistency**: Matches SDK's primary auth method
3. **Isolation**: Each test gets its own identity
4. **Security**: Demonstrates secure auth patterns

## Future Improvements

Potential enhancements for this testing infrastructure:

1. **Performance Testing**: Add benchmarks for API response times
2. **Contract Testing**: Generate OpenAPI specs from tests
3. **Error Injection**: Test SDK resilience to network failures
4. **Parallel Execution**: Run tests in parallel with better isolation
5. **Real HTTP Mode**: Optional mode to test with actual HTTP server
