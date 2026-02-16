/**
 * SDK Mock Setup
 *
 * This file sets up the global fetch mock for SDK e2e tests.
 * It must be imported at the module level in test files.
 *
 * Uses vi.stubGlobal() to intercept native fetch calls and route them
 * directly to Dashboard API handlers without making actual network requests.
 */

import { vi, beforeAll } from 'vitest';
import { handleApiRequest } from '~/server/api';

// Mock the runtime implementation to avoid actual container execution
vi.mock('~/server/packages/runtimes', () => ({
  getRuntime: vi.fn(() => ({
    getDefinitions: vi.fn(async () => ({
      success: true,
      providers: [],
      triggers: [],
    })),
    invoke: vi.fn(async () => ({ success: true, result: 'mocked' })),
  })),
}));

/**
 * Custom fetch implementation that routes to Dashboard API handlers
 *
 * This intercepts all fetch calls made by the SDK and routes them
 * directly to the API route handlers, bypassing the network layer entirely.
 */
async function testFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  // Convert input to URL string
  const urlString = typeof input === 'string'
    ? input
    : input instanceof URL
    ? input.toString()
    : input.url;

  // Create a Request object compatible with the Dashboard router
  const request = new Request(urlString, {
    method: init?.method || 'GET',
    headers: init?.headers,
    body: init?.body,
  });

  // Route through the Dashboard API handler
  const response = await handleApiRequest(request);

  if (!response) {
    // No route matched - return 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return response;
}

// Stub global fetch before any tests run
// This ensures the SDK's fetch calls are intercepted
beforeAll(() => {
  vi.stubGlobal('fetch', testFetch);
});
