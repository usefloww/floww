import { getProvider } from "@developerflows/floww-sdk";

const gitlab = getProvider("gitlab", "asdfasdf");

gitlab.triggers.onMergeRequestComment({
  projectId: "19677180",
  handler: async (ctx, event) => {
    await slack.actions.sendMessage({
      channel: "adsf",
      message: event.body.merge_request.title,
    });
  },
});
