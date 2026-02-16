/**
 * API Router Core
 *
 * Route registration helpers and handler types.
 * Separated from index.ts to avoid circular dependencies with route files.
 */

import { type ZodSchema, type ZodError } from 'zod';
import { authenticateRequest, type AuthenticatedUser } from '~/server/services/auth';
import { logger, updateRequestContext } from '~/server/utils/logger';
import { captureException } from '~/server/utils/sentry';

export interface ApiContext {
  user: AuthenticatedUser | null;
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
}

export interface RouteHandler {
  (ctx: ApiContext): Promise<Response>;
}

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  requireAuth: boolean;
}

const routes: Route[] = [];

/**
 * Parse a route pattern into a regex and param names
 */
function parsePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexPattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return {
    regex: new RegExp(`^${regexPattern}$`),
    paramNames,
  };
}

/**
 * Register a route
 */
function registerRoute(
  method: string,
  pattern: string,
  handler: RouteHandler,
  requireAuth: boolean = true
): void {
  const { regex, paramNames } = parsePattern(pattern);
  routes.push({
    method: method.toUpperCase(),
    pattern: regex,
    paramNames,
    handler,
    requireAuth,
  });
}

// Route registration helpers
export const get = (pattern: string, handler: RouteHandler, requireAuth = true) =>
  registerRoute('GET', pattern, handler, requireAuth);
export const post = (pattern: string, handler: RouteHandler, requireAuth = true) =>
  registerRoute('POST', pattern, handler, requireAuth);
export const put = (pattern: string, handler: RouteHandler, requireAuth = true) =>
  registerRoute('PUT', pattern, handler, requireAuth);
export const patch = (pattern: string, handler: RouteHandler, requireAuth = true) =>
  registerRoute('PATCH', pattern, handler, requireAuth);
export const del = (pattern: string, handler: RouteHandler, requireAuth = true) =>
  registerRoute('DELETE', pattern, handler, requireAuth);

/**
 * JSON response helper
 */
export function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Error response helper
 */
export function errorResponse(message: string, status: number = 400): Response {
  return json({ error: message }, status);
}

/**
 * Format Zod validation errors into a readable message
 */
function formatZodError(error: ZodError): string {
  const messages = error.errors.map((e) => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });
  return messages.join(', ');
}

/**
 * Parse and validate request body with Zod schema
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: errorResponse('Invalid JSON body', 400) };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return { error: errorResponse(formatZodError(result.error), 400) };
  }

  return { data: result.data };
}

/**
 * Main API handler - matches routes and executes handlers
 */
export async function handleApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Only handle /api routes
  if (!pathname.startsWith('/api/')) {
    return null;
  }

  const apiPath = pathname.slice(4); // Remove /api prefix
  const method = request.method.toUpperCase();

  // Find matching route
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = apiPath.match(route.pattern);
    if (!match) continue;

    // Extract params
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      params[name] = match[i + 1];
    });

    // Authenticate if required
    let user: AuthenticatedUser | null = null;
    if (route.requireAuth) {
      const cookies = request.headers.get('cookie');
      const authHeader = request.headers.get('authorization');
      user = await authenticateRequest(cookies, authHeader);

      if (!user) {
        return json({ error: 'Unauthorized' }, 401);
      }

      // Update request context with userId for logging
      updateRequestContext({ userId: user.id });
    }

    // Create context
    const ctx: ApiContext = {
      user,
      request,
      params,
      query: url.searchParams,
    };

    // Execute handler
    try {
      return await route.handler(ctx);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { path: apiPath, method, params });
      logger.error('API error', { error: err.message, stack: err.stack });
      return json({ error: 'Internal server error' }, 500);
    }
  }

  // No route matched
  return json({ error: 'Not found' }, 404);
}
