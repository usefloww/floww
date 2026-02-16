/**
 * ExecutionContext - Manages internal contextual data for SDK operations
 *
 * This class stores internal data (like auth tokens, workflow IDs) that needs
 * to be propagated to services without exposing sensitive data to user code.
 *
 * Key features:
 * - Per-event isolation (no shared state between events)
 * - Automatic extraction from event data
 * - Extensible for new internal fields
 * - Hidden from user-facing context
 */

export interface ExecutionContextData {
  /** Auth token for backend API calls */
  authToken?: string;
  /** Workflow ID for the current execution */
  workflowId?: string;
  /** Backend URL for API calls */
  backendUrl?: string;
  /** Extensible storage for additional internal data */
  [key: string]: any;
}

export class ExecutionContext {
  private data: ExecutionContextData;

  constructor(initialData: ExecutionContextData = {}) {
    this.data = { ...initialData };
  }

  /**
   * Get the auth token
   */
  getAuthToken(): string | undefined {
    return this.data.authToken;
  }

  /**
   * Set the auth token
   */
  setAuthToken(token: string): void {
    this.data.authToken = token;
  }

  /**
   * Get the workflow ID
   */
  getWorkflowId(): string | undefined {
    return this.data.workflowId;
  }

  /**
   * Set the workflow ID
   */
  setWorkflowId(id: string): void {
    this.data.workflowId = id;
  }

  /**
   * Get the backend URL
   */
  getBackendUrl(): string | undefined {
    return this.data.backendUrl;
  }

  /**
   * Set the backend URL
   */
  setBackendUrl(url: string): void {
    this.data.backendUrl = url;
  }

  /**
   * Get a custom value from the context
   */
  get<T = any>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  /**
   * Set a custom value in the context
   */
  set(key: string, value: any): void {
    this.data[key] = value;
  }

  /**
   * Get all context data (for debugging/logging)
   */
  getAll(): ExecutionContextData {
    return { ...this.data };
  }

  /**
   * Extract context data from an event object
   * Automatically maps event fields to context fields
   */
  static fromEvent(event: any): ExecutionContext {
    const contextData: ExecutionContextData = {};

    // Extract from __context if present (new format)
    if (event?.__context) {
      if (event.__context.auth_token) {
        contextData.authToken = event.__context.auth_token;
      }
      if (event.__context.backend_url) {
        contextData.backendUrl = event.__context.backend_url;
      }
      if (event.__context.workflow_id) {
        contextData.workflowId = event.__context.workflow_id;
      }
    }

    // Fallback to top-level fields for backward compatibility
    if (!contextData.authToken && event?.auth_token) {
      contextData.authToken = event.auth_token;
    }
    if (!contextData.workflowId && event?.workflow_id) {
      contextData.workflowId = event.workflow_id;
    }
    if (!contextData.backendUrl && event?.backend_url) {
      contextData.backendUrl = event.backend_url;
    }

    return new ExecutionContext(contextData);
  }
}
