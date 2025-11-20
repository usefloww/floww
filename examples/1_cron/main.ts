import { Builtin } from "floww";

const builtin = new Builtin();

builtin.triggers.onCron({
  expression: "*/5 * * * *",
  handler: (ctx, event) => {
    console.log("Do this every second", event.scheduledTime);
  },
});
