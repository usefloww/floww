import { Builtin, getProvider } from "@developerflows/floww-sdk";

export const builtin = new Builtin();
const gitlab = getProvider("gitlab", "test");

builtin.triggers.onCron({
  expression: "*/1 * * * * *",
  handler: (ctx, event) => {
    // throw Error();
    console.log("Cron trigger", event.scheduledTime);
  },
});
