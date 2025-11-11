/**
 * Runtime trigger invocation
 *
 * This module provides the core trigger execution logic used by runtime images
 * (Docker, Lambda, etc.) to invoke user-defined triggers.
 */

import { executeUserProject } from "../codeExecution";

/**
 * Create wrapped project with auto-registration support
 * Injects provider configs and wrapper code to extract registered triggers
 */
function createWrappedProject(
  files: Record<string, string>,
  entrypoint: string,
  providerConfigs: Record<string, any> = {}
) {
  const [fileAndExport] = entrypoint.includes(".")
    ? entrypoint.split(".", 2)
    : [entrypoint, "default"];

  const wrapperCode = `
        const {
            getUsedProviders,
            getRegisteredTriggers,
            clearRegisteredTriggers,
            clearUsedProviders,
            setProviderConfigs
        } = require('floww');

        clearRegisteredTriggers();
        clearUsedProviders();

        const __providerConfigs__ = ${JSON.stringify(providerConfigs)};
        setProviderConfigs(__providerConfigs__);

        const originalModule = require('./${fileAndExport.replace(".ts", "")}');

        const usedProviders = getUsedProviders();
        const registeredTriggers = getRegisteredTriggers();

        module.exports = registeredTriggers;
        module.exports.default = registeredTriggers;
        module.exports.triggers = registeredTriggers;
        module.exports.providers = usedProviders;
        module.exports.originalResult = originalModule;
    `;

  return {
    files: {
      ...files,
      "__wrapper__.js": wrapperCode,
    },
    entryPoint: "__wrapper__",
  };
}

/**
 * Report execution status to the backend
 *
 * Used by runtime images to notify the backend when an execution completes
 * or fails, allowing the backend to track execution status.
 *
 * @param backendUrl - The backend URL to report to
 * @param executionId - The execution ID
 * @param authToken - Authentication token for the backend
 * @param error - Optional error details if execution failed
 */
export async function reportExecutionStatus(
  backendUrl: string,
  executionId: string,
  authToken: string,
  error?: { message: string; stack?: string }
) {
  try {
    const response = await fetch(
      `${backendUrl}/api/executions/${executionId}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(error ? { error } : {}),
      }
    );

    if (!response.ok) {
      console.error(
        `Failed to report execution status: ${response.status} ${response.statusText}`
      );
    }
  } catch (err) {
    console.error("Error reporting execution status:", err);
  }
}

/**
 * Trigger invocation event payload
 */
export interface InvokeTriggerEvent {
  // User code to execute
  userCode: {
    files: Record<string, string>;
    entrypoint: string;
  };

  // Execution ID and auth token
  execution_id?: string;
  auth_token?: string;

  // Trigger event details
  triggerType: "webhook" | "cron" | "realtime";

  // Webhook-specific fields
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;

  // Cron-specific fields
  expression?: string;
  scheduledTime?: string;

  // Realtime-specific fields
  channel?: string;
  messageType?: string;
  data?: any;

  // Provider configuration
  providerConfigs?: Record<string, any>;
}

/**
 * Trigger invocation result
 */
export interface InvokeTriggerResult {
  success: boolean;
  triggersProcessed: number;
  triggersExecuted: number;
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Invoke trigger execution for a given event
 *
 * This function:
 * 1. Wraps user code with provider config injection
 * 2. Executes the wrapped project to extract registered triggers
 * 3. Routes the event to matching trigger handlers
 * 4. Reports execution status to backend if credentials provided
 * 5. Returns execution results
 *
 * @param event - The trigger event payload
 * @returns Execution result with status and metadata
 */
export async function invokeTrigger(
  event: InvokeTriggerEvent
): Promise<InvokeTriggerResult> {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

  try {
    console.log("🚀 Floww Runtime - Processing event");

    // Extract user code from the event
    if (!event.userCode) {
      throw new Error("No userCode provided in event payload");
    }

    // Extract files and entrypoint
    const files = event.userCode.files;
    const entrypoint = event.userCode.entrypoint || "main.ts";

    if (!files) {
      throw new Error(
        'userCode must have a "files" property with the code files'
      );
    }

    console.log(`📂 Loading entrypoint: ${entrypoint}`);

    // Extract provider configs from event (if provided)
    const providerConfigs = event.providerConfigs || {};

    // Create wrapped project with auto-registration support
    const wrappedProject = createWrappedProject(
      files,
      entrypoint,
      providerConfigs
    );

    // Execute wrapped project
    const module = await executeUserProject(wrappedProject);
    const triggers = module.triggers || module.default || [];

    if (!Array.isArray(triggers) || triggers.length === 0) {
      throw new Error(
        "No triggers were auto-registered. Make sure you are creating triggers using builtin.triggers.onWebhook() or similar methods."
      );
    }

    console.log(`✅ Loaded ${triggers.length} trigger(s)`);

    // Route the event to appropriate triggers based on event type
    // Match ALL triggers with matching properties (handles duplicates correctly)
    let executedCount = 0;

    if (event.triggerType === "cron") {
      // Handle cron trigger - match by expression
      const cronTriggers = triggers.filter(
        (t: any) => t.type === "cron" && t.expression === event.expression
      );
      for (const trigger of cronTriggers) {
        console.log(`⏰ Executing cron trigger: ${trigger.expression}`);
        await trigger.handler(
          {},
          {
            scheduledTime: event.scheduledTime || new Date().toISOString(),
            expression: event.expression,
          }
        );
        executedCount++;
      }
    } else if (event.triggerType === "webhook") {
      // Handle webhook trigger - match by path and method
      // Backend sends paths with /webhook/ prefix, but user code may not include it
      const normalizedEventPath = event.path?.replace(/^\/webhook/, "") || "/";

      const webhookTriggers = triggers.filter((t: any) => {
        if (t.type !== "webhook") return false;
        const triggerPath = t.path || "/webhook";
        const triggerMethod = t.method || "POST";

        // Normalize trigger path for comparison
        const normalizedTriggerPath =
          triggerPath.replace(/^\/webhook/, "") || "/";

        return (
          normalizedEventPath === normalizedTriggerPath &&
          event.method === triggerMethod
        );
      });

      for (const trigger of webhookTriggers) {
        const triggerPath = trigger.path || "/webhook";
        const triggerMethod = trigger.method || "POST";
        console.log(
          `🌐 Executing webhook trigger: ${triggerMethod} ${triggerPath}`
        );
        await trigger.handler(
          {},
          {
            method: event.method,
            path: event.path,
            headers: event.headers || {},
            body: event.body,
            query: event.query || {},
          }
        );
        executedCount++;
      }
    } else if (event.triggerType === "realtime") {
      // Handle realtime trigger - match by channel
      const realtimeTriggers = triggers.filter((t: any) => {
        if (t.type !== "realtime") return false;
        return (
          t.channel === event.channel &&
          (!t.messageType || t.messageType === event.messageType)
        );
      });

      for (const trigger of realtimeTriggers) {
        console.log(`📡 Executing realtime trigger: ${trigger.channel}`);
        await trigger.handler(
          {},
          {
            channel: event.channel,
            type: event.messageType,
            data: event.data,
          }
        );
        executedCount++;
      }
    } else {
      console.log(`⚠️ Unknown trigger type: ${event.triggerType}`);
    }

    if (executedCount === 0) {
      console.log(`⚠️ No matching triggers found for ${event.triggerType}`);
    }

    // Report successful execution to backend if credentials provided
    if (backendUrl && event.execution_id && event.auth_token) {
      await reportExecutionStatus(
        backendUrl,
        event.execution_id,
        event.auth_token
      );
    }

    return {
      success: true,
      triggersProcessed: triggers.length,
      triggersExecuted: executedCount,
    };
  } catch (error: any) {
    console.error("❌ Trigger execution failed:", error);

    const errorDetails = {
      message: error.message,
      stack: error.stack,
    };

    // Report failed execution to backend if credentials provided
    if (backendUrl && event.execution_id && event.auth_token) {
      await reportExecutionStatus(
        backendUrl,
        event.execution_id,
        event.auth_token,
        errorDetails
      );
    }

    return {
      success: false,
      triggersProcessed: 0,
      triggersExecuted: 0,
      error: errorDetails,
    };
  }
}
