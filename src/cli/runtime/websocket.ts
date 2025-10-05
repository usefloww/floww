import { Centrifuge, Subscription, SubscriptionState } from 'centrifuge';
import { RealtimeTrigger, RealtimeEvent } from '../../common';

export interface WebSocketConfig {
  url: string;
  token?: string;
  debug?: boolean;
}

export class WebSocketManager {
  private centrifuge: Centrifuge | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private triggers: Map<string, RealtimeTrigger[]> = new Map();
  private metadata: Map<RealtimeTrigger, Map<string, any>> = new Map();

  constructor(private config: WebSocketConfig) {}

  async connect(): Promise<void> {
    if (this.centrifuge) {
      await this.disconnect();
    }

    this.centrifuge = new Centrifuge(this.config.url, {
      token: this.config.token,
      debug: this.config.debug || false,
    });

    this.centrifuge.on('connected', (ctx) => {
      console.log('🔗 Connected to Centrifugo:', ctx);
    });

    this.centrifuge.on('disconnected', (ctx) => {
      console.log('❌ Disconnected from Centrifugo:', ctx);
    });

    this.centrifuge.on('error', (ctx) => {
      console.error('💥 Centrifugo error:', ctx);
    });

    this.centrifuge.connect();
  }

  async disconnect(): Promise<void> {
    if (this.centrifuge) {
      // Unsubscribe from all channels
      for (const [channel, subscription] of this.subscriptions) {
        subscription.unsubscribe();
      }
      this.subscriptions.clear();

      this.centrifuge.disconnect();
      this.centrifuge = null;
    }
  }

  async registerTrigger(trigger: RealtimeTrigger): Promise<void> {
    if (!this.centrifuge) {
      throw new Error('WebSocket not connected. Call connect() first.');
    }

    const channel = trigger.channel;

    // Initialize metadata storage for this trigger
    const metadata = new Map<string, any>();
    this.metadata.set(trigger, metadata);

    // Call setup if provided
    if (trigger.setup) {
      await trigger.setup({
        channel,
        setMetadata: (key: string, value: any) => {
          metadata.set(key, value);
        },
      });
    }

    // Add trigger to our registry
    if (!this.triggers.has(channel)) {
      this.triggers.set(channel, []);
    }
    this.triggers.get(channel)!.push(trigger);

    // Subscribe to channel if not already subscribed
    if (!this.subscriptions.has(channel)) {
      await this.subscribeToChannel(channel);
    }

    console.log(`📡 Registered realtime trigger for channel: ${channel}`);
  }

  private async subscribeToChannel(channel: string): Promise<void> {
    if (!this.centrifuge) {
      throw new Error('WebSocket not connected');
    }

    const subscription = this.centrifuge.newSubscription(channel);

    subscription.on('subscribed', (ctx) => {
      console.log(`✅ Subscribed to channel: ${channel}`);
    });

    subscription.on('error', (ctx) => {
      console.error(`❌ Subscription error for channel ${channel}:`, ctx);
    });

    subscription.on('publication', async (ctx) => {
      await this.handleMessage(channel, ctx.data);
    });

    // Get authentication token if needed
    const triggers = this.triggers.get(channel) || [];
    const authTrigger = triggers.find(t => t.authentication);

    if (authTrigger && authTrigger.authentication) {
      try {
        const token = await authTrigger.authentication();
        subscription.setToken(token);
      } catch (error) {
        console.error(`Failed to get authentication token for channel ${channel}:`, error);
      }
    }

    subscription.subscribe();
    this.subscriptions.set(channel, subscription);
  }

  private async handleMessage(channel: string, data: any): Promise<void> {
    const triggers = this.triggers.get(channel) || [];

    for (const trigger of triggers) {
      try {
        // Filter by message type if specified
        if (trigger.messageType && data.type !== trigger.messageType) {
          continue;
        }

        // Convert data to RealtimeEvent format
        const event: RealtimeEvent = {
          type: data.type || 'unknown',
          workflow_id: data.workflow_id || '',
          payload: data.payload || data,
          timestamp: data.timestamp || new Date().toISOString(),
          channel: channel,
        };

        // Execute trigger handler
        await trigger.handler({}, event);

        console.log(`🚀 Executed realtime trigger for ${event.type} on channel ${channel}`);
      } catch (error) {
        console.error(`Failed to execute realtime trigger for channel ${channel}:`, error);
      }
    }
  }

  async updateToken(token: string): Promise<void> {
    this.config.token = token;

    if (this.centrifuge) {
      this.centrifuge.setToken(token);

      // Update tokens for all subscriptions
      for (const subscription of this.subscriptions.values()) {
        subscription.setToken(token);
      }
    }
  }

  async unregisterTrigger(trigger: RealtimeTrigger): Promise<void> {
    const channel = trigger.channel;
    const triggers = this.triggers.get(channel) || [];

    // Remove trigger from registry
    const index = triggers.indexOf(trigger);
    if (index > -1) {
      triggers.splice(index, 1);
    }

    // Call teardown if provided
    if (trigger.teardown) {
      const metadata = this.metadata.get(trigger);
      await trigger.teardown({
        getMetadata: (key: string) => metadata?.get(key),
      });
    }

    // Clean up metadata
    this.metadata.delete(trigger);

    // If no more triggers for this channel, unsubscribe
    if (triggers.length === 0) {
      const subscription = this.subscriptions.get(channel);
      if (subscription) {
        subscription.unsubscribe();
        this.subscriptions.delete(channel);
      }
      this.triggers.delete(channel);
    }

    console.log(`📡 Unregistered realtime trigger for channel: ${channel}`);
  }

  getConnectionState(): string {
    if (!this.centrifuge) {
      return 'disconnected';
    }

    switch (this.centrifuge.state) {
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'disconnected':
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

  getSubscriptionState(channel: string): string {
    const subscription = this.subscriptions.get(channel);
    if (!subscription) {
      return 'unsubscribed';
    }

    switch (subscription.state) {
      case SubscriptionState.Subscribed:
        return 'subscribed';
      case SubscriptionState.Subscribing:
        return 'subscribing';
      case SubscriptionState.Unsubscribed:
        return 'unsubscribed';
      default:
        return 'unknown';
    }
  }

  getActiveChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  async clearAll(): Promise<void> {
    // Call teardown for all triggers
    for (const triggers of this.triggers.values()) {
      for (const trigger of triggers) {
        if (trigger.teardown) {
          const metadata = this.metadata.get(trigger);
          await trigger.teardown({
            getMetadata: (key: string) => metadata?.get(key),
          });
        }
      }
    }

    // Clear all data structures
    this.triggers.clear();
    this.metadata.clear();

    // Disconnect
    await this.disconnect();
  }
}