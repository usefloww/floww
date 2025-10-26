import { getProvider } from "@developerflows/floww-sdk";

const gitlab = getProvider("gitlab");

gitlab.triggers.onMergeRequestComment({
  projectId: "123454",
  handler: (ctx, event) => {
    console.log(
      "[Work Account] GitLab MR comment:",
      event.body.object_attributes.note
    );
    console.log("User:", event.body.user.username);
  },
});
