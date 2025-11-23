/**
 * Integration tests for runtime trigger invocation
 * These tests verify trigger matching and execution logic using real code execution
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { invokeTrigger, InvokeTriggerEvent } from "../../src/runtime/index";

describe("Runtime Trigger Invocation", () => {
  beforeEach(() => {
    // Mock fetch globally to avoid network calls
    global.fetch = vi.fn();
  });

  it("should not execute any triggers when no trigger matches", async () => {
    // Use a global variable to capture handler execution
    const testResults: { called: boolean; eventData: any } = {
      called: false,
      eventData: null,
    };

    // Make testResults accessible from VM context
    (global as any).__testResults__ = testResults;

    // Real user code that registers a cron trigger with expression "*/5 * * * *"
    const userCode = `
      const { Builtin } = require('floww');
      
      const builtin = new Builtin();
      
      builtin.triggers.onCron({
        expression: "*/5 * * * *",
        handler: (ctx, event) => {
          // Capture execution for testing
          if (typeof __testResults__ !== 'undefined') {
            __testResults__.called = true;
            __testResults__.eventData = event;
          }
        },
      });
    `;

    const event: InvokeTriggerEvent = {
      userCode: {
        files: {
          "main.ts": userCode,
        },
        entrypoint: "main.ts",
      },
      trigger: {
        provider: {
          type: "builtin",
          alias: "default",
        },
        triggerType: "onCron",
        // Different expression - won't match
        input: { expression: "*/10 * * * *" },
      },
      data: { scheduledTime: "2024-01-01T00:00:00Z" },
    };

    const result = await invokeTrigger(event);

    expect(result.success).toBe(true);
    expect(result.triggersProcessed).toBeGreaterThan(0);
    expect(result.triggersExecuted).toBe(0); // No triggers executed
    expect(testResults.called).toBe(false); // Handler should not be called

    // Cleanup
    delete (global as any).__testResults__;
  });

  it("should execute matching triggers when a trigger matches", async () => {
    // Use a global variable to capture handler execution
    const testResults: { called: boolean; eventData: any } = {
      called: false,
      eventData: null,
    };

    // Make testResults accessible from VM context
    (global as any).__testResults__ = testResults;

    // Real user code that registers a cron trigger (similar to examples/1_cron/main.ts)
    const userCode = `
      const { Builtin } = require('floww');
      
      const builtin = new Builtin();
      
      builtin.triggers.onCron({
        expression: "*/5 * * * *",
        handler: (ctx, event) => {
          // Capture execution for testing
          if (typeof __testResults__ !== 'undefined') {
            __testResults__.called = true;
            __testResults__.eventData = event;
          }
          console.log("Cron handler executed", event);
        },
      });
    `;

    const event: InvokeTriggerEvent = {
      userCode: {
        files: {
          "main.ts": userCode,
        },
        entrypoint: "main.ts",
      },
      trigger: {
        provider: {
          type: "builtin",
          alias: "default", // Matches
        },
        triggerType: "onCron", // Matches
        input: { expression: "*/5 * * * *" }, // Matches
      },
      data: { scheduledTime: "2024-01-01T00:00:00Z", text: "Hello world" },
    };

    const result = await invokeTrigger(event);

    expect(result.success).toBe(true);
    expect(result.triggersProcessed).toBeGreaterThan(0);
    expect(result.triggersExecuted).toBe(1); // Trigger was executed
    expect(testResults.called).toBe(true);
    expect(testResults.eventData).toEqual({
      scheduledTime: "2024-01-01T00:00:00Z",
      text: "Hello world",
    });

    // Cleanup
    delete (global as any).__testResults__;
  });

  it("should execute GitHub onPush trigger when trigger matches", async () => {
    // Use a global variable to capture handler execution
    const testResults: { called: boolean; eventData: any } = {
      called: false,
      eventData: null,
    };

    // Make testResults accessible from VM context
    (global as any).__testResults__ = testResults;

    // Real user code that registers a GitHub onPush trigger
    const userCode = `
      const { Discord, GitHub } = require('floww');

      const discord = new Discord();
      const github = new GitHub();

      github.triggers.onPush({
        branch: "main",
        owner: "usefloww",
        repository: "floww-dashboard",
        handler: async (ctx, event) => {
          // Capture execution for testing
          if (typeof __testResults__ !== 'undefined') {
            __testResults__.called = true;
            __testResults__.eventData = event;
          }
          console.log("GitHub push handler executed", event);
        },
      });
    `;

    const event: InvokeTriggerEvent = {
      userCode: {
        files: {
          "main.ts": userCode,
        },
        entrypoint: "main.ts",
      },
      trigger: {
        provider: {
          type: "github",
          alias: "default",
        },
        triggerType: "onPush",
        input: {
          owner: "usefloww",
          branch: "main",
          repository: "floww-dashboard",
        },
      },
      data: {
        ref: "refs/heads/main",
        before: "abc123",
        after: "def456",
        repository: {
          name: "floww-dashboard",
          full_name: "usefloww/floww-dashboard",
        },
      },
    };

    const result = await invokeTrigger(event);

    expect(result.success).toBe(true);
    expect(result.triggersProcessed).toBeGreaterThan(0);
    expect(result.triggersExecuted).toBe(1); // Trigger should be executed
    expect(testResults.called).toBe(true);
    expect(testResults.eventData).toEqual({
      ref: "refs/heads/main",
      before: "abc123",
      after: "def456",
      repository: {
        name: "floww-dashboard",
        full_name: "usefloww/floww-dashboard",
      },
    });

    // Cleanup
    delete (global as any).__testResults__;
  });
});
