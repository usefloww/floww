import { WebClient } from "@slack/web-api";

export type SlackApiConfig = {
  botToken: string;
};

export type SlackMessage = {
  channel: string;
  text?: string;
  blocks?: any[];
  attachments?: any;
  thread_ts?: string;
  reply_broadcast?: boolean;
  mrkdwn?: boolean;
  [key: string]: any;
};

export type SlackChannel = {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  created: number;
  is_archived: boolean;
  is_general: boolean;
  is_member: boolean;
  [key: string]: any;
};

export type SlackUser = {
  id: string;
  name: string;
  real_name: string;
  profile: {
    email?: string;
    display_name?: string;
    real_name?: string;
    image_original?: string;
    [key: string]: any;
  };
  [key: string]: any;
};

export class SlackApi {
  private client: WebClient;

  constructor(config: SlackApiConfig) {
    this.client = new WebClient(config.botToken);
  }

  // Message operations
  async sendMessage(message: SlackMessage): Promise<any> {
    const result = await this.client.chat.postMessage({
      channel: message.channel,
      text: message.text,
      blocks: message.blocks,
      attachments: message.attachments,
      thread_ts: message.thread_ts,
      reply_broadcast: message.reply_broadcast,
      mrkdwn: message.mrkdwn ?? true,
      ...message,
    } as any);

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }

  async updateMessage(
    channel: string,
    ts: string,
    message: Partial<SlackMessage>
  ): Promise<any> {
    const result = await this.client.chat.update({
      channel,
      ts,
      text: message.text,
      blocks: message.blocks,
      attachments: message.attachments as any,
      ...message,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }

  async deleteMessage(channel: string, ts: string): Promise<any> {
    const result = await this.client.chat.delete({
      channel,
      ts,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }

  // Channel operations
  async listChannels(): Promise<SlackChannel[]> {
    const result = await this.client.conversations.list({
      types: "public_channel,private_channel",
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result.channels as SlackChannel[];
  }

  async getChannel(channelId: string): Promise<SlackChannel> {
    const result = await this.client.conversations.info({
      channel: channelId,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result.channel as SlackChannel;
  }

  async createChannel(
    name: string,
    isPrivate: boolean = false
  ): Promise<SlackChannel> {
    const result = await this.client.conversations.create({
      name,
      is_private: isPrivate,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result.channel as SlackChannel;
  }

  // User operations
  async listUsers(): Promise<SlackUser[]> {
    const result = await this.client.users.list({});

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result.members as SlackUser[];
  }

  async getUser(userId: string): Promise<SlackUser> {
    const result = await this.client.users.info({
      user: userId,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result.user as SlackUser;
  }

  // Reactions
  async addReaction(
    channel: string,
    timestamp: string,
    name: string
  ): Promise<any> {
    const result = await this.client.reactions.add({
      channel,
      timestamp,
      name,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }

  async removeReaction(
    channel: string,
    timestamp: string,
    name: string
  ): Promise<any> {
    const result = await this.client.reactions.remove({
      channel,
      timestamp,
      name,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }

  // File operations
  async uploadFile(
    channels: string,
    file: Buffer | string,
    filename?: string,
    title?: string,
    initialComment?: string
  ): Promise<any> {
    const result = await this.client.files.uploadV2({
      channels,
      file,
      filename,
      title,
      initial_comment: initialComment,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }

  // Auth test
  async test(): Promise<any> {
    const result = await this.client.auth.test();

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }
}
