import Fastify, { FastifyInstance } from 'fastify';
import { WebhookTrigger, WebhookEvent } from '../../common';

export class WebhookServer {
  private app: FastifyInstance;
  private webhooks: Map<string, WebhookTrigger> = new Map();
  private isRouteRegistered = false;

  constructor(private port: number, private host: string) {
    this.app = Fastify({
      logger: {
        level: 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      },
    });

    // Parse JSON bodies
    this.app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      try {
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (err: any) {
        done(err, undefined);
      }
    });
  }

  private registerDynamicRoute() {
    if (this.isRouteRegistered) return;

    // Register dynamic webhook handler
    this.app.all('/webhooks/*', async (request, reply) => {
      const path = request.url.replace('/webhooks', '');
      const trigger = this.webhooks.get(path);

      if (!trigger) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      // Build webhook event
      const event: WebhookEvent = {
        body: request.body || {},
        headers: request.headers as Record<string, string>,
        query: request.query as Record<string, string>,
        method: request.method,
        path: request.url,
      };

      // Validate webhook if validation function is provided
      if (trigger.validation) {
        try {
          const isValid = await trigger.validation(event);
          if (!isValid) {
            return reply.code(401).send({ error: 'Webhook validation failed' });
          }
        } catch (error) {
          console.error('Webhook validation error:', error);
          return reply.code(401).send({ error: 'Webhook validation failed' });
        }
      }

      // Execute handler
      try {
        await trigger.handler({}, event);
        return reply.code(200).send({ success: true });
      } catch (error) {
        console.error('Webhook handler error:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    });

    this.isRouteRegistered = true;
  }

  registerRoute(trigger: WebhookTrigger) {
    const path = trigger.path || '/webhook';
    this.webhooks.set(path, trigger);
  }

  clearWebhooks() {
    this.webhooks.clear();
  }

  async start() {
    this.registerDynamicRoute();
    try {
      await this.app.listen({ port: this.port, host: this.host });
      console.log(`🌐 Webhook server listening on http://${this.host}:${this.port}`);
    } catch (err) {
      console.error('Failed to start webhook server:', err);
      throw err;
    }
  }

  async stop() {
    await this.app.close();
  }
}
