import { getProvider } from "@developerflows/floww-sdk";

const slack = getProvider("slack");

// Trigger when a message is sent in any Slack channel
slack.triggers.onMessage({
  channelId: "C09PQ8TNKNH",
  handler: async (ctx, event) => {
    const message = event.body.event;

    console.log(`Received message from ${message.user} in channel ${message.channel}`);
    console.log(`Message text: ${message.text}`);

    // Send a reply in the same channel
    await slack.actions.sendMessage({
      channel: message.channel,
      text: `I received your message: "${message.text}"`,
      // Reply in a thread to keep conversations organized
      thread_ts: message.ts,
    });
  },
});
