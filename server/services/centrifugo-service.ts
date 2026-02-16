/**
 * Centrifugo Service
 *
 * Handles real-time messaging via Centrifugo for live updates.
 * Used for streaming execution logs, webhook events, etc.
 */

import crypto from 'crypto';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

export interface WorkflowMessage {
  type: string;
  workflowId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WebhookEventData {
  type: 'webhook';
  authToken?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  triggerMetadata?: Record<string, unknown>;
}

class CentrifugoService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = settings.centrifugo.CENTRIFUGO_API_KEY;
    // Parse the public URL to get the base URL (remove protocol if needed for internal use)
    const publicUrl = new URL(settings.centrifugo.CENTRIFUGO_PUBLIC_URL);
    this.baseUrl = `${publicUrl.protocol}//${publicUrl.host}`;
  }

  /**
   * Publish data to a Centrifugo channel via HTTP API
   */
  async publishToChannel(channel: string, data: Record<string, unknown>): Promise<boolean> {
    try {
      const payload = {
        method: 'publish',
        params: { channel, data },
      };

      const response = await fetch(`${this.baseUrl}/api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `apikey ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.error) {
          logger.error('Centrifugo API error', {
            channel,
            error: result.error,
          });
          return false;
        }

        logger.debug('Successfully published to channel', {
          channel,
          dataType: (data as Record<string, unknown>).type ?? 'unknown',
        });
        return true;
      } else {
        logger.error('Failed to publish to channel', {
          channel,
          statusCode: response.status,
        });
        return false;
      }
    } catch (error) {
      logger.error('Error publishing to Centrifugo channel', {
        channel,
        error: String(error),
      });
      return false;
    }
  }

  /**
   * Publish webhook event to dev channel for local development.
   * Fire-and-forget - if no dev session is active, Centrifugo will drop the message.
   */
  async publishDevWebhookEvent(
    workflowId: string,
    triggerMetadata: Record<string, unknown>,
    webhookData: WebhookEventData
  ): Promise<void> {
    const channel = `workflow:${workflowId}`;

    const eventData: WebhookEventData = {
      type: 'webhook',
      authToken: webhookData.authToken,
      path: webhookData.path,
      method: webhookData.method,
      headers: webhookData.headers ?? {},
      body: webhookData.body ?? {},
      query: webhookData.query ?? {},
      triggerMetadata,
    };

    // Fire and forget
    await this.publishToChannel(channel, eventData as unknown as Record<string, unknown>);
  }

  /**
   * Publish execution status update
   */
  async publishExecutionUpdate(
    workflowId: string,
    executionId: string,
    status: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const channel = `workflow:${workflowId}`;

    await this.publishToChannel(channel, {
      type: 'execution',
      executionId,
      status,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Publish log entries for an execution
   */
  async publishExecutionLogs(
    workflowId: string,
    executionId: string,
    logs: Array<{ level: string; message: string; timestamp: string }>
  ): Promise<void> {
    const channel = `workflow:${workflowId}`;

    await this.publishToChannel(channel, {
      type: 'logs',
      executionId,
      logs,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Generate a Centrifugo connection token for a user/channel
   * Uses HMAC-SHA256 for token generation
   */
  generateConnectionToken(userId: string, expiresInSeconds: number = 3600): string {
    const secret = settings.centrifugo.CENTRIFUGO_JWT_SECRET;
    
    // Note: In production, use a proper JWT library
    // This is a simplified implementation
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url');
    
    // For proper HMAC, use crypto
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  /**
   * Generate a subscription token for a specific channel
   */
  generateSubscriptionToken(
    userId: string,
    channel: string,
    expiresInSeconds: number = 3600
  ): string {
    const secret = settings.centrifugo.CENTRIFUGO_JWT_SECRET;
    
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = Buffer.from(JSON.stringify({ sub: userId, channel, exp })).toString('base64url');
    
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }
}

// Global singleton instance
export const centrifugoService = new CentrifugoService();

// Export functions for direct use
export const publishToChannel = centrifugoService.publishToChannel.bind(centrifugoService);
export const publishDevWebhookEvent = centrifugoService.publishDevWebhookEvent.bind(centrifugoService);
export const publishExecutionUpdate = centrifugoService.publishExecutionUpdate.bind(centrifugoService);
export const publishExecutionLogs = centrifugoService.publishExecutionLogs.bind(centrifugoService);
export const generateConnectionToken = centrifugoService.generateConnectionToken.bind(centrifugoService);
export const generateSubscriptionToken = centrifugoService.generateSubscriptionToken.bind(centrifugoService);
