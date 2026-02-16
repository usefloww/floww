/**
 * Sentry Utilities
 *
 * Provides Sentry error reporting and performance monitoring.
 * Only active when SENTRY_DSN is configured.
 */

import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

// Check if Sentry should be enabled
const SENTRY_DSN = settings.general.SENTRY_DSN;
const SENTRY_ENVIRONMENT = settings.general.SENTRY_ENVIRONMENT ?? 'development';
const SENTRY_RELEASE = settings.general.SENTRY_RELEASE;

// Lazy-loaded Sentry instance
let sentryInstance: typeof import('@sentry/node') | null = null;

/**
 * Initialize Sentry (call once at app startup)
 */
export async function initSentry(): Promise<void> {
  if (!SENTRY_DSN) {
    logger.debug('Sentry not configured (SENTRY_DSN not set)');
    return;
  }

  try {
    const Sentry = await import('@sentry/node');
    
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      release: SENTRY_RELEASE,
      tracesSampleRate: settings.general.SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
      profilesSampleRate: settings.general.SENTRY_PROFILES_SAMPLE_RATE ?? 0.1,
    });

    sentryInstance = Sentry;
    logger.info('Sentry initialized', { environment: SENTRY_ENVIRONMENT, release: SENTRY_RELEASE });
  } catch (error) {
    logger.warn('Failed to initialize Sentry', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Get the Sentry instance (returns null if not initialized)
 */
export function getSentry(): typeof import('@sentry/node') | null {
  return sentryInstance;
}

/**
 * Capture an exception
 */
export function captureException(
  error: Error,
  context?: Record<string, unknown>
): string | undefined {
  if (!sentryInstance) {
    logger.error('Error captured (Sentry not available)', { error: error.message });
    return undefined;
  }

  if (context) {
    sentryInstance.setContext('additional', context);
  }

  return sentryInstance.captureException(error);
}

/**
 * Capture a message
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug' = 'info'
): string | undefined {
  if (!sentryInstance) {
    logger.info('Message captured (Sentry not available)', { message });
    return undefined;
  }

  return sentryInstance.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
  if (!sentryInstance) {
    return;
  }

  sentryInstance.setUser(user);
}

/**
 * Set additional context
 */
export function setContext(name: string, context: Record<string, unknown>): void {
  if (!sentryInstance) {
    return;
  }

  sentryInstance.setContext(name, context);
}

/**
 * Set a tag
 */
export function setTag(key: string, value: string): void {
  if (!sentryInstance) {
    return;
  }

  sentryInstance.setTag(key, value);
}

/**
 * Add a breadcrumb
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message?: string;
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
  data?: Record<string, unknown>;
}): void {
  if (!sentryInstance) {
    return;
  }

  sentryInstance.addBreadcrumb(breadcrumb);
}

/**
 * Start a new transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  op: string
): { finish: () => void; setTag: (key: string, value: string) => void } | null {
  if (!sentryInstance) {
    return null;
  }

  const transaction = sentryInstance.startInactiveSpan({
    name,
    op,
  });

  return {
    finish: () => transaction?.end(),
    setTag: (key: string, value: string) => transaction?.setAttribute(key, value),
  };
}

/**
 * Wrap a function with Sentry error tracking
 */
export function withSentry<T extends (...args: unknown[]) => unknown>(
  fn: T,
  name?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof Error) {
        captureException(error, { functionName: name ?? fn.name });
      }
      throw error;
    }
  }) as T;
}

/**
 * Flush any remaining events before shutdown
 */
export async function flush(timeout: number = 2000): Promise<boolean> {
  if (!sentryInstance) {
    return true;
  }

  return sentryInstance.flush(timeout);
}
