import { ExecutionContext } from "./ExecutionContext";

/**
 * Global manager for the current execution context.
 * Provides access to execution-scoped data (auth tokens, workflow ID, etc.)
 * from anywhere in the call chain.
 */
class ExecutionContextManager {
  private currentContext?: ExecutionContext;

  /**
   * Set the current execution context (called by EventRouter before handler execution)
   */
  setContext(context: ExecutionContext): void {
    this.currentContext = context;
  }

  /**
   * Get the current execution context
   * @throws Error if no execution context is set
   */
  getContext(): ExecutionContext {
    if (!this.currentContext) {
      throw new Error(
        "No execution context available. This should only be called within a handler."
      );
    }
    return this.currentContext;
  }

  /**
   * Clear the current execution context (called after handler execution)
   */
  clearContext(): void {
    this.currentContext = undefined;
  }

  /**
   * Check if an execution context is currently available
   */
  hasContext(): boolean {
    return !!this.currentContext;
  }
}

// Export singleton instance
// In VM contexts, use the injected global instance to ensure consistency across contexts
export const executionContextManager =
  (global as any).__flowwExecutionContextManager__ || new ExecutionContextManager();
