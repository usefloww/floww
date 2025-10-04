import path from 'path';
import { pathToFileURL } from 'url';
import { register } from 'tsx/esm/api';
import { Trigger, WebhookTrigger, CronTrigger, Provider } from '../../common';
import { WebhookServer } from './server';
import { CronScheduler } from './scheduler';
import { SecretManager } from '../secrets/secretManager';

// Register tsx loader for TypeScript support
const tsxUnregister = register({
  namespace: Date.now().toString(),
});

export class FlowEngine {
  private server: WebhookServer;
  private scheduler: CronScheduler;
  private triggers: Trigger[] = [];
  private secretManager: SecretManager;
  private providers: Set<Provider> = new Set();
  private webhookMetadata: Map<WebhookTrigger, Map<string, any>> = new Map();

  constructor(private port: number, private host: string) {
    // TODO: Remove this, Temporary override to use ngrok
    // this.host = "b260a36b09c2.ngrok-free.app";
    this.server = new WebhookServer(port, host);
    this.scheduler = new CronScheduler();
    this.secretManager = new SecretManager();
  }

  async load(filePath: string): Promise<Trigger[]> {
    try {
      // Resolve absolute path
      const absolutePath = path.resolve(process.cwd(), filePath);

      // Convert to file URL for dynamic import
      const fileUrl = pathToFileURL(absolutePath).href;

      // Dynamically import the triggers file (tsx will handle TypeScript)
      const module = await import(fileUrl);

      // Get the default export (array of triggers)
      const triggers = module.default;

      if (!Array.isArray(triggers)) {
        throw new Error('Triggers file must export an array of triggers as default export');
      }

      this.triggers = triggers;

      // Extract providers from the module
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

  async start() {
    console.log(`\n🚀 Starting Flow Engine...`);
    console.log(`📁 Loaded ${this.triggers.length} trigger(s)\n`);

    // Prompt for missing secrets
    await this.promptForMissingSecrets();

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
      }
    }

    await this.server.stop();
    this.scheduler.stopAll();
    console.log('\n👋 Flow Engine stopped');
  }

  private async registerTrigger(trigger: Trigger) {
    if (trigger.type === 'webhook') {
      await this.registerWebhook(trigger as WebhookTrigger);
    } else if (trigger.type === 'cron') {
      await this.registerCron(trigger as CronTrigger);
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

  async reload(filePath: string) {
    console.log('\n🔄 Reloading triggers...');

    // Stop current triggers
    this.scheduler.stopAll();
    this.server.clearWebhooks();

    // Clear module cache to force reload
    const absolutePath = path.resolve(process.cwd(), filePath);
    const fileUrl = pathToFileURL(absolutePath).href;
    delete require.cache[fileUrl];

    // Reload triggers
    await this.load(filePath);

    console.log(`\n🚀 Reloading ${this.triggers.length} trigger(s)\n`);

    // Re-register all triggers (server is still running)
    for (const trigger of this.triggers) {
      await this.registerTrigger(trigger);
    }

    console.log(`\n✅ Triggers reloaded successfully`);
  }
}
