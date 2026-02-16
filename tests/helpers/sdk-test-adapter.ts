/**
 * SDK Test Adapter
 *
 * This module provides infrastructure for testing the floww-sdk against
 * the Dashboard API handlers without needing a real HTTP server.
 *
 * Note: The actual node-fetch mock is set up in tests/setup/sdk-mock.ts
 * which must be imported at the module level in test files.
 */

/**
 * Set up SDK test environment
 *
 * This function configures the test environment to route SDK calls
 * through the Dashboard API handlers.
 *
 * Call this in your test setup or at the beginning of each test suite.
 *
 * @param options Configuration options
 * @param options.baseUrl Base URL for the SDK (default: http://localhost:3000)
 */
export function setupSdkTestEnvironment(options?: { baseUrl?: string }) {
  const baseUrl = options?.baseUrl || 'http://localhost:3000';

  // Set up environment variables
  process.env.FLOWW_BACKEND_URL = baseUrl;
}

/**
 * Clean up SDK test environment
 *
 * Call this after your tests to clean up environment variables.
 */
export function teardownSdkTestEnvironment() {
  delete process.env.FLOWW_BACKEND_URL;
  delete process.env.FLOWW_TOKEN;
}

/**
 * Set SDK authentication token for tests
 *
 * @param token Service account token to use
 */
export function setSdkToken(token: string) {
  process.env.FLOWW_TOKEN = token;
}

/**
 * Clear SDK authentication token
 */
export function clearSdkToken() {
  delete process.env.FLOWW_TOKEN;
}
