import path from 'path';
import { pathToFileURL } from 'url';
import { register } from 'tsx/esm/api';
import { Trigger, WebhookTrigger, CronTrigger } from '../../common';
import { WebhookServer } from './server';
import { CronScheduler } from './scheduler';

// Register tsx loader for TypeScript support
const tsxUnregister = register({
  namespace: Date.now().toString(),
});

export class FlowEngine {
  private server: WebhookServer;
  private scheduler: CronScheduler;
  private triggers: Trigger[] = [];

  constructor(private port: number, private host: string) {
    this.server = new WebhookServer(port, host);
    this.scheduler = new CronScheduler();
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
      return triggers;
    } catch (error) {
      console.error('Failed to load triggers:', error);
      throw error;
    }
  }

  async start() {
    console.log(`\n🚀 Starting Flow Engine...`);
    console.log(`📁 Loaded ${this.triggers.length} trigger(s)\n`);

    // Register all triggers BEFORE starting the server
    for (const trigger of this.triggers) {
      await this.registerTrigger(trigger);
    }

    // Start webhook server after routes are registered
    await this.server.start();

    console.log(`\n✅ Flow Engine is running`);
  }

  async stop() {
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
    const webhookUrl = `http://${this.host}:${this.port}${trigger.path || '/webhook'}`;

    // Call setup if provided
    if (trigger.setup) {
      await trigger.setup({ webhookUrl });
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
