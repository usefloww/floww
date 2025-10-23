import {
  Trigger,
  WebhookTrigger,
  CronTrigger,
  RealtimeTrigger,
  Provider,
} from "../../common";
import { SecretManager } from "../secrets/secretManager";
import {
  executeUserProject,
  getUserProject,
  DebugContext,
} from "@/codeExecution";
import { EventStream, EventProducer } from "./types";
import { WebhookEventProducer } from "./eventProducers/webhookEventProducer";
import { CronEventProducer } from "./eventProducers/cronEventProducer";
import { WebSocketEventProducer } from "./eventProducers/websocketEventProducer";
import { ApiClient } from "../api/client";
import { getConfig } from "../config/configUtils";
import { tryLoadProjectConfig, ProjectConfig } from "../config/projectConfig";
import { logger } from "../utils/logger";
import { fetchWorkflow } from "../api/apiMethods";

export class FlowEngine {
  private eventStream = new EventStream();
  private eventProducers: EventProducer[] = [];
  private triggers: Trigger[] = [];
  private secretManager = new SecretManager();
  private providers: Set<Provider> = new Set();
  private webhookMetadata: Map<WebhookTrigger, Map<string, any>> = new Map();
  private realtimeMetadata: Map<RealtimeTrigger, Map<string, any>> = new Map();
  private projectConfig: ProjectConfig | null = null;
  private debugContext?: DebugContext;
  private debugMode: boolean = false;
  private debugPort: number = 9229;

  constructor(
    private port: number,
    private host: string,
    debugMode: boolean = false,
    debugPort: number = 9229
  ) {
    this.debugMode = debugMode;
    this.debugPort = debugPort;

    // Initialize debug context if debug mode is enabled
    if (this.debugMode) {
      this.debugContext = new DebugContext();
      this.debugContext.enableDebug(true, this.debugPort);
    }

    this.eventProducers = [
      new WebhookEventProducer(port, host),
      new CronEventProducer(),
      new WebSocketEventProducer(),
    ];

    // Try to load project config
    this.projectConfig = tryLoadProjectConfig();
  }

  private async initializeSecretManager(): Promise<void> {
    // Initialize API client and SecretManager
    const config = getConfig();
    const apiClient = new ApiClient(config.backendUrl, config.workosClientId);

    // Get namespace ID from workflow or environment variable
    let namespaceId: string | undefined;

    if (this.projectConfig) {
      // Only show project config in debug mode
      if (this.debugMode) {
        logger.info(`Loaded project config: ${this.projectConfig.name}`);
        if (this.projectConfig.workflowId) {
          logger.plain(`   Workflow ID: ${this.projectConfig.workflowId}`);
        }
      }

      // If we have a workflowId, fetch the namespace from the workflow
      if (this.projectConfig.workflowId) {
        try {
          const workflow = await fetchWorkflow(this.projectConfig.workflowId);
          namespaceId = workflow.namespace_id;
        } catch (error) {
          // If workflow fetch fails, fall back to environment variable
          logger.warn(
            `Failed to fetch workflow details: ${
              error instanceof Error ? error.message : error
            }`
          );
        }
      }
    }

    // Fall back to environment variable if no namespaceId from workflow
    if (!namespaceId) {
      namespaceId = process.env.FLOWW_NAMESPACE_ID;
      if (namespaceId) {
        if (!this.projectConfig) {
          logger.warn(
            "No floww.yaml found, using FLOWW_NAMESPACE_ID from environment"
          );
          logger.tip('Run "floww init" to create a project config file');
        }
      }
    }

    if (!namespaceId) {
      throw new Error(
        "No namespace ID found. Either:\n" +
          '  1. Run "floww init" to create a floww.yaml file with a valid workflowId, or\n' +
          "  2. Set the FLOWW_NAMESPACE_ID environment variable"
      );
    }

    this.secretManager = new SecretManager(apiClient, namespaceId);
  }

  async load(filePath: string): Promise<Trigger[]> {
    const userProject = await getUserProject(filePath, "default");
    const module = await executeUserProject({
      ...userProject,
      debugMode: this.debugMode,
      debugContext: this.debugContext,
    });
    const triggers = module.default;

    if (!Array.isArray(triggers)) {
      throw new Error(
        "Triggers file must export an array of triggers as default export"
      );
    }

    this.triggers = triggers;
    this.extractProviders(module);
    return triggers;
  }

  private extractProviders(module: any): void {
    for (const key in module) {
      const value = module[key];
      if (
        value &&
        typeof value === "object" &&
        "providerType" in value &&
        "triggers" in value
      ) {
        this.providers.add(value as Provider);
      }
    }
  }

  private async promptForMissingSecrets(): Promise<void> {
    for (const provider of this.providers) {
      if (
        !provider.secretDefinitions ||
        provider.secretDefinitions.length === 0
      ) {
        continue;
      }

      const credentialName = provider.credentialName || "default";
      const secrets = await this.secretManager.ensureProviderSecrets(
        provider.providerType,
        credentialName,
        provider.secretDefinitions
      );

      if (provider.configure) {
        provider.configure(secrets);
      }
    }
  }

  private setupEventRouting(): void {
    this.eventStream.on("data", async (event) => {
      const startTime = Date.now();

      // Enhanced request logging with better details
      let eventDescription = "";
      if (event.type === "webhook") {
        const method = event.data?.method || "POST";
        const path = event.data?.path || "/webhook";
        eventDescription = `${method} ${path}`;
      } else if (event.type === "cron") {
        eventDescription = event.data?.expression || "scheduled";
      } else if (event.type === "realtime") {
        eventDescription = `channel: ${event.data?.channel || "unknown"}`;
      } else {
        eventDescription = event.type;
      }

      logger.info(`Incoming ${event.type} request: ${eventDescription}`);

      try {
        if (event.trigger) {
          // Direct trigger provided (webhook/cron)
          await event.trigger.handler({}, event.data);
        } else if (event.type === "realtime") {
          // Find matching realtime triggers
          const realtimeTriggers = this.triggers.filter(
            (t) => t.type === "realtime"
          ) as RealtimeTrigger[];
          for (const trigger of realtimeTriggers) {
            if (
              trigger.channel === event.data.channel &&
              (!trigger.messageType || trigger.messageType === event.data.type)
            ) {
              await trigger.handler({}, event.data);
            }
          }
        }

        const executionTime = Date.now() - startTime;
        logger.success(`${event.type} request completed in ${executionTime}ms`);
      } catch (error) {
        const executionTime = Date.now() - startTime;
        if (this.debugContext) {
          this.debugContext.reportError(error, {
            eventType: event.type,
            eventData: event.data,
            triggerType: event.trigger?.type || "unknown",
          });
        } else {
          logger.error(
            `${event.type} request failed after ${executionTime}ms:`,
            error
          );
        }
      }
    });
  }

  private async updateProducers(): Promise<void> {
    // Update all producers with current triggers
    for (const producer of this.eventProducers) {
      await producer.updateTriggers(this.triggers, this.eventStream);
    }

    // Log triggers
    for (const trigger of this.triggers) {
      if (trigger.type === "webhook") {
        logger.plain(
          `📌 Webhook: ${(trigger as WebhookTrigger).method || "POST"} /webhooks${
            (trigger as WebhookTrigger).path || "/webhook"
          }`
        );
      } else if (trigger.type === "cron") {
        logger.plain(`⏰ Cron: ${(trigger as CronTrigger).expression}`);
      } else if (trigger.type === "realtime") {
        logger.plain(`📡 Realtime: ${(trigger as RealtimeTrigger).channel}`);
      }
    }
  }

  async start() {
    // Initialize secret manager first
    await this.initializeSecretManager();

    // Combine starting and loaded info into one line
    logger.success(
      `Flow Engine running with ${this.triggers.length} trigger(s)${
        this.debugMode ? ` (debugging on port ${this.debugPort})` : ""
      }`
    );

    // Remove verbose debug feature list - users know they enabled debug mode

    await this.promptForMissingSecrets();

    // Start inspector if in debug mode
    if (this.debugMode && this.debugContext) {
      try {
        await this.debugContext.startInspector();
      } catch (error) {
        logger.warn("Failed to start inspector:", error);
        logger.plain("   Continuing without inspector integration");
      }
    }

    this.setupEventRouting();
    await this.updateProducers();

    // No need for additional "running" message since we already said it's running above
  }

  async stop() {
    logger.info("Stopping Flow Engine...");

    // Stop inspector if running
    if (this.debugContext) {
      try {
        await this.debugContext.stopInspector();
      } catch (error) {
        logger.warn("Error stopping inspector:", error);
      }
    }

    for (const producer of this.eventProducers) {
      await producer.stop();
    }

    this.eventStream.removeAllListeners();
    logger.success("Flow Engine stopped");
  }

  async reload(filePath: string) {
    await this.load(filePath);
    await this.updateProducers();

    logger.success("Triggers reloaded successfully");
  }
}
