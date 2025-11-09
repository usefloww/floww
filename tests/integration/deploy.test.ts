import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CommandSpace } from "../utils/CommandSpace";
import {
  simpleExampleFiles,
  waitUntilStdout,
} from "../utils/CommandTestHelpers";

describe("Deploy Command Tests", () => {
  let commandSpace: CommandSpace;

  beforeEach(async () => {
    commandSpace = new CommandSpace(simpleExampleFiles);
    await commandSpace.initialize();
    await commandSpace.setupRealAuth();
  });

  afterEach(async () => {
    await commandSpace.exit();
  });

  it("should deploy a workflow to production", async () => {
    const command = commandSpace.backgroundCommand("deploy", { tty: true });
    await waitUntilStdout(command, "Starting deployment", 5000);
    await waitUntilStdout(command, "Building runtime image", 5000);
    await waitUntilStdout(command, "Deploying workflow...", 100000);
  });

  it.todo("should handle deployment failures gracefully");
  it.todo("should show deployment status");
});
