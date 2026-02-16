/**
 * Pino-based logging with request context via AsyncLocalStorage
 *
 * Usage:
 *   import { logger } from '~/server/utils/logger';
 *   logger.info('Message', { extraData: 'value' });
 *
 * Request context (requestId, method, path, userId) is automatically
 * included in all logs when running within a request context.
 */

import pino, { type Logger } from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  method?: string;
  path?: string;
  userId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

// Read directly from process.env to avoid circular dependency with settings
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Create base pino logger
const baseLogger: Logger = pino({
  level: LOG_LEVEL,
  transport: !IS_PRODUCTION
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

/**
 * Get a logger with request context attached.
 * If called outside a request context, returns the base logger.
 */
export function getLogger(): Logger {
  const ctx = asyncLocalStorage.getStore();
  return ctx ? baseLogger.child(ctx) : baseLogger;
}

/**
 * Run a function with request context.
 * All logs within the function will include the context.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current request context (if any).
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Update the current request context (e.g., to add userId after auth).
 * Returns false if not in a request context.
 */
export function updateRequestContext(updates: Partial<RequestContext>): boolean {
  const ctx = asyncLocalStorage.getStore();
  if (ctx) {
    Object.assign(ctx, updates);
    return true;
  }
  return false;
}

/**
 * Convenience logger object with methods that automatically include request context.
 */
export const logger = {
  trace: (msg: string, obj?: object) => getLogger().trace(obj, msg),
  debug: (msg: string, obj?: object) => getLogger().debug(obj, msg),
  info: (msg: string, obj?: object) => getLogger().info(obj, msg),
  warn: (msg: string, obj?: object) => getLogger().warn(obj, msg),
  error: (msg: string, obj?: object) => getLogger().error(obj, msg),
  fatal: (msg: string, obj?: object) => getLogger().fatal(obj, msg),

  /**
   * Log an error with its message and stack trace.
   */
  errorWithStack: (msg: string, err: Error, obj?: object) =>
    getLogger().error({ ...obj, error: err.message, stack: err.stack }, msg),

  /**
   * Create a child logger with additional context.
   */
  child: (bindings: object) => getLogger().child(bindings),
};

/**
 * Log an HTTP access event with request/response details.
 */
export function logAccess(data: {
  method: string;
  path: string;
  status: number;
  duration: number;
  ip?: string;
  userAgent?: string;
}) {
  getLogger().info(data, 'access');
}
