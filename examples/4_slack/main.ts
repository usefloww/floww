import { getProvider } from "@developerflows/floww-sdk";

const slack = getProvider("slack");
const buildin = getProvider("builtin");

buildin.triggers.onCron({
  expression: "*/30 * * * * *",
  handler: async (ctx, event) => {
    await slack.actions.sendMessage({
      channel: "",
      text: "Hello",
      mrkdwn: true,
    });
  },
});
