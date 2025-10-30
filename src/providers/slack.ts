import { BaseProvider, BaseProviderConfig } from "./base";
import { SlackApi } from "./slack/api";
import { Action } from "../common";

export type SlackConfig = BaseProviderConfig & {
  workspace_url?: string;
};

export type SendMessageArgs = {
  channel: string;
  text?: string;
  blocks?: any[];
  attachments?: any;
  thread_ts?: string;
  reply_broadcast?: boolean;
  mrkdwn?: boolean;
};

class SlackActions {
  constructor(private getApi: () => SlackApi) {}

  async sendMessage(args: SendMessageArgs): Promise<any> {
    const api = this.getApi();
    return await api.sendMessage({
      channel: args.channel,
      text: args.text,
      blocks: args.blocks,
      attachments: args.attachments,
      thread_ts: args.thread_ts,
      reply_broadcast: args.reply_broadcast,
      mrkdwn: args.mrkdwn ?? true,
    });
  }

  async updateMessage(
    args: { channel: string; ts: string } & Partial<SendMessageArgs>
  ): Promise<any> {
    const api = this.getApi();
    return await api.updateMessage(args.channel, args.ts, {
      text: args.text,
      blocks: args.blocks,
      attachments: args.attachments,
    });
  }

  async deleteMessage(args: { channel: string; ts: string }): Promise<any> {
    const api = this.getApi();
    return await api.deleteMessage(args.channel, args.ts);
  }

  async addReaction(args: {
    channel: string;
    timestamp: string;
    name: string;
  }): Promise<any> {
    const api = this.getApi();
    return await api.addReaction(args.channel, args.timestamp, args.name);
  }

  async removeReaction(args: {
    channel: string;
    timestamp: string;
    name: string;
  }): Promise<any> {
    const api = this.getApi();
    return await api.removeReaction(args.channel, args.timestamp, args.name);
  }

  async uploadFile(args: {
    channels: string;
    file: Buffer | string;
    filename?: string;
    title?: string;
    initialComment?: string;
  }): Promise<any> {
    const api = this.getApi();
    return await api.uploadFile(
      args.channels,
      args.file,
      args.filename,
      args.title,
      args.initialComment
    );
  }

  async listChannels(): Promise<any> {
    const api = this.getApi();
    return await api.listChannels();
  }

  async getChannel(args: { channelId: string }): Promise<any> {
    const api = this.getApi();
    return await api.getChannel(args.channelId);
  }

  async createChannel(args: {
    name: string;
    isPrivate?: boolean;
  }): Promise<any> {
    const api = this.getApi();
    return await api.createChannel(args.name, args.isPrivate);
  }

  async listUsers(): Promise<any> {
    const api = this.getApi();
    return await api.listUsers();
  }

  async getUser(args: { userId: string }): Promise<any> {
    const api = this.getApi();
    return await api.getUser(args.userId);
  }
}

export class Slack extends BaseProvider {
  providerType = "slack";
  private api?: SlackApi;
  actions: SlackActions;

  constructor(config?: SlackConfig) {
    super(config);
    this.actions = new SlackActions(() => this.getApi());
  }

  private getApi(): SlackApi {
    if (!this.api) {
      const botToken = this.getConfig("bot_token");
      this.api = new SlackApi({ botToken });
    }
    return this.api;
  }

  triggers = {};
}
