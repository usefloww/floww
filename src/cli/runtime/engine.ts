import { Trigger, WebhookTrigger, CronTrigger, RealtimeTrigger, Provider } from '../../common';
import { WebhookServer } from './server';
import { CronScheduler } from './scheduler';
import { WebSocketManager } from './websocket';
import { SecretManager } from '../secrets/secretManager';
import { executeUserProject, getUserProject } from '@/codeExecution';


export class FlowEngine {
  private server: WebhookServer;
  private scheduler: CronScheduler;
  private wsManager: WebSocketManager | null = null;
  private triggers: Trigger[] = [];
  private secretManager: SecretManager;
  private providers: Set<Provider> = new Set();
  private webhookMetadata: Map<WebhookTrigger, Map<string, any>> = new Map();
  private realtimeMetadata: Map<RealtimeTrigger, Map<string, any>> = new Map();

  constructor(private port: number, private host: string) {
    // TODO: Remove this, Temporary override to use ngrok
    // this.host = "b260a36b09c2.ngrok-free.app";
    this.server = new WebhookServer(port, host);
    this.scheduler = new CronScheduler();
    this.secretManager = new SecretManager();
  }

  async load(filePath: string): Promise<Trigger[]> {
    try {
      const userProject = await getUserProject(filePath, 'default');
      const module = await executeUserProject(userProject);

      const triggers = module.default;

      if (!Array.isArray(triggers)) {
        throw new Error('Triggers file must export an array of triggers as default export');
      }

      this.triggers = triggers;

      this.extractProviders(module);

      return triggers;
    } catch (error) {
      console.error('Failed to load triggers:', error);
      throw error;
    }
  }

  private extractProviders(module: any): void {
    // Look for provider instances in the module
    for (const key in module) {
      const value = module[key];
      if (value && typeof value === 'object' && 'providerType' in value && 'triggers' in value) {
        this.providers.add(value as Provider);
      }
    }
  }

  private async promptForMissingSecrets(): Promise<void> {
    for (const provider of this.providers) {
      if (!provider.secretDefinitions || provider.secretDefinitions.length === 0) {
        continue;
      }

      const credentialName = provider.credentialName || 'default';

      // Automatically ensure secrets exist (triggers interactive setup if missing)
      const secrets = await this.secretManager.ensureProviderSecrets(
        provider.providerType,
        credentialName,
        provider.secretDefinitions
      );

      // Configure the provider with secrets
      if (provider.configure) {
        provider.configure(secrets);
      }
    }
  }

  private async initializeWebSocket() {
    const realtimeTriggers = this.triggers.filter(t => t.type === 'realtime') as RealtimeTrigger[];

    if (realtimeTriggers.length === 0) {
      return; // No realtime triggers, skip WebSocket setup
    }

    // Initialize WebSocket manager
    // Note: In production, these should come from configuration
    const wsUrl = process.env.CENTRIFUGO_WS_URL || 'ws://localhost:8000/connection/websocket';

    this.wsManager = new WebSocketManager({
      url: wsUrl,
      debug: process.env.NODE_ENV !== 'production'
    });

    try {
      await this.wsManager.connect();
      console.log(`🔗 WebSocket connection established`);
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      throw error;
    }
  }

  async start() {
    console.log(`\n🚀 Starting Flow Engine...`);
    console.log(`📁 Loaded ${this.triggers.length} trigger(s)\n`);

    // Prompt for missing secrets
    await this.promptForMissingSecrets();

    // Initialize WebSocket if needed
    await this.initializeWebSocket();

    // Register all triggers BEFORE starting the server
    for (const trigger of this.triggers) {
      await this.registerTrigger(trigger);
    }

    // Start webhook server after routes are registered
    await this.server.start();

    console.log(`\n✅ Flow Engine is running`);
  }

  async stop() {
    console.log('\n🛑 Stopping Flow Engine...');

    // Call teardown for all triggers
    for (const trigger of this.triggers) {
      if (trigger.type === 'webhook') {
        const webhookTrigger = trigger as WebhookTrigger;
        if (webhookTrigger.teardown) {
          const metadata = this.webhookMetadata.get(webhookTrigger);
          await webhookTrigger.teardown({
            getMetadata: (key: string) => metadata?.get(key),
          });
        }
      } else if (trigger.type === 'cron') {
        const cronTrigger = trigger as CronTrigger;
        if (cronTrigger.teardown) {
          await cronTrigger.teardown({});
        }
      } else if (trigger.type === 'realtime') {
        const realtimeTrigger = trigger as RealtimeTrigger;
        if (this.wsManager) {
          await this.wsManager.unregisterTrigger(realtimeTrigger);
        }
      }
    }

    await this.server.stop();
    this.scheduler.stopAll();

    // Clean up WebSocket connection
    if (this.wsManager) {
      await this.wsManager.clearAll();
      this.wsManager = null;
    }

    console.log('\n👋 Flow Engine stopped');
  }

  private async registerTrigger(trigger: Trigger) {
    if (trigger.type === 'webhook') {
      await this.registerWebhook(trigger as WebhookTrigger);
    } else if (trigger.type === 'cron') {
      await this.registerCron(trigger as CronTrigger);
    } else if (trigger.type === 'realtime') {
      await this.registerRealtime(trigger as RealtimeTrigger);
    }
  }

  private async registerWebhook(trigger: WebhookTrigger) {
    const webhookUrl = `https://${this.host}:${this.port}/webhooks${trigger.path || '/webhook'}`;

    // Initialize metadata storage for this webhook
    const metadata = new Map<string, any>();
    this.webhookMetadata.set(trigger, metadata);

    // Call setup if provided
    if (trigger.setup) {
      await trigger.setup({
        webhookUrl,
        setMetadata: (key: string, value: any) => {
          metadata.set(key, value);
        },
      });
    }

    // Register route with server
    this.server.registerRoute(trigger);

    console.log(`📌 Webhook: ${trigger.method || 'POST'} ${trigger.path || '/webhook'}`);
  }

  private async registerCron(trigger: CronTrigger) {
    // Call setup if provided
    if (trigger.setup) {
      await trigger.setup({});
    }

    // Register with scheduler
    this.scheduler.register(trigger);

    console.log(`⏰ Cron: ${trigger.expression}`);
  }

  private async registerRealtime(trigger: RealtimeTrigger) {
    if (!this.wsManager) {
      throw new Error('WebSocket manager not initialized');
    }

    // Register with WebSocket manager
    await this.wsManager.registerTrigger(trigger);

    console.log(`📡 Realtime: ${trigger.channel} (${trigger.messageType || 'all messages'})`);
  }

  async reload(filePath: string) {
    console.log('\n🔄 Reloading triggers...');

    // Stop current triggers
    this.scheduler.stopAll();
    this.server.clearWebhooks();

    // Clean up WebSocket connections
    if (this.wsManager) {
      await this.wsManager.clearAll();
      this.wsManager = null;
    }

    // Clear module cache to force reload
    // const absolutePath = path.resolve(process.cwd(), filePath);
    // const fileUrl = pathToFileURL(absolutePath).href;
    // delete require.cache[fileUrl];

    // Reload triggers
    await this.load(filePath);

    console.log(`\n🚀 Reloading ${this.triggers.length} trigger(s)\n`);

    // Re-initialize WebSocket if needed
    await this.initializeWebSocket();

    // Re-register all triggers (server is still running)
    for (const trigger of this.triggers) {
      await this.registerTrigger(trigger);
    }

    console.log(`\n✅ Triggers reloaded successfully`);
  }
}
