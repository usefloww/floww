/**
 * Unit tests for provider management
 * These tests verify provider setup and configuration logic
 */

import { describe, it, expect } from "vitest";
import {
  fetchProviders,
  fetchProviderType,
  createProvider,
  updateProvider,
  deleteProvider,
} from "../../src/cli/api/apiMethods";

describe("Provider Management Unit Tests", () => {
  describe("Provider Listing", () => {
    it("should list all available providers", async () => {
      const providers = await fetchProviders();

      expect(providers).toBeInstanceOf(Array);
      expect(providers.length).toBeGreaterThanOrEqual(2); // At least slack and gitlab

      // Check structure of providers
      providers.forEach((provider) => {
        expect(provider).toHaveProperty("id");
        expect(provider).toHaveProperty("type");
        expect(provider).toHaveProperty("alias");
        expect(provider).toHaveProperty("namespace_id");
        expect(provider).toHaveProperty("config");
      });
    });

    it("should include slack provider in results", async () => {
      const providers = await fetchProviders();
      const slackProvider = providers.find((p) => p.type === "slack");

      expect(slackProvider).toBeDefined();
      expect(slackProvider?.config).toHaveProperty("bot_token");
    });

    it("should include gitlab provider in results", async () => {
      const providers = await fetchProviders();
      const gitlabProvider = providers.find((p) => p.type === "gitlab");

      expect(gitlabProvider).toBeDefined();
      expect(gitlabProvider?.config).toHaveProperty("access_token");
    });
  });

  describe("Provider Type Schemas", () => {
    it("should fetch slack provider schema", async () => {
      const schema = await fetchProviderType("slack");

      expect(schema).toHaveProperty("provider_type", "slack");
      expect(schema).toHaveProperty("setup_steps");
      expect(schema.setup_steps).toBeInstanceOf(Array);

      // Verify setup steps structure
      schema.setup_steps.forEach((step) => {
        expect(step).toHaveProperty("type");
        expect(step).toHaveProperty("title");
        expect(step).toHaveProperty("alias");
        expect(step).toHaveProperty("required");
      });

      // Slack should have at least bot_token field
      const botTokenStep = schema.setup_steps.find((s) => s.alias === "bot_token");
      expect(botTokenStep).toBeDefined();
      expect(botTokenStep?.required).toBe(true);
    });

    it("should fetch gitlab provider schema", async () => {
      const schema = await fetchProviderType("gitlab");

      expect(schema).toHaveProperty("provider_type", "gitlab");
      expect(schema.setup_steps).toBeInstanceOf(Array);

      // GitLab should have access_token field
      const accessTokenStep = schema.setup_steps.find((s) => s.alias === "access_token");
      expect(accessTokenStep).toBeDefined();
      expect(accessTokenStep?.required).toBe(true);

      // GitLab should have base_url field (optional)
      const baseUrlStep = schema.setup_steps.find((s) => s.alias === "base_url");
      expect(baseUrlStep).toBeDefined();
      expect(baseUrlStep?.required).toBe(false);
      expect(baseUrlStep?.default).toBe("https://gitlab.com");
    });

    it("should fetch github provider schema", async () => {
      const schema = await fetchProviderType("github");

      expect(schema).toHaveProperty("provider_type", "github");
      expect(schema.setup_steps).toBeInstanceOf(Array);

      // GitHub should have access_token field
      const accessTokenStep = schema.setup_steps.find((s) => s.alias === "access_token");
      expect(accessTokenStep).toBeDefined();
      expect(accessTokenStep?.required).toBe(true);
    });
  });

  describe("Provider Creation", () => {
    it("should create a new slack provider", async () => {
      const newProvider = await createProvider({
        namespace_id: "test-namespace-id",
        type: "slack",
        alias: "my-slack-workspace",
        config: {
          bot_token: "xoxb-new-token-123",
        },
      });

      expect(newProvider).toHaveProperty("id");
      expect(newProvider).toHaveProperty("type", "slack");
      expect(newProvider).toHaveProperty("alias", "my-slack-workspace");
      expect(newProvider).toHaveProperty("namespace_id", "test-namespace-id");
      expect(newProvider.config).toHaveProperty("bot_token", "xoxb-new-token-123");
    });

    it("should create a new gitlab provider", async () => {
      const newProvider = await createProvider({
        namespace_id: "test-namespace-id",
        type: "gitlab",
        alias: "my-gitlab",
        config: {
          access_token: "glpat-new-token-123",
          base_url: "https://gitlab.example.com",
        },
      });

      expect(newProvider).toHaveProperty("type", "gitlab");
      expect(newProvider).toHaveProperty("alias", "my-gitlab");
      expect(newProvider.config).toHaveProperty("access_token");
      expect(newProvider.config).toHaveProperty("base_url");
    });

    it("should create a new github provider", async () => {
      const newProvider = await createProvider({
        namespace_id: "test-namespace-id",
        type: "github",
        alias: "my-github",
        config: {
          access_token: "ghp-new-token-123",
        },
      });

      expect(newProvider).toHaveProperty("type", "github");
      expect(newProvider).toHaveProperty("alias", "my-github");
      expect(newProvider.config).toHaveProperty("access_token", "ghp-new-token-123");
    });
  });

  describe("Provider Updates", () => {
    it("should update provider alias", async () => {
      const updated = await updateProvider("provider-slack-123", {
        alias: "updated-alias",
      });

      expect(updated).toHaveProperty("id", "provider-slack-123");
      expect(updated).toHaveProperty("alias", "updated-alias");
    });

    it("should update provider config", async () => {
      const updated = await updateProvider("provider-slack-123", {
        config: {
          bot_token: "xoxb-updated-token",
        },
      });

      expect(updated).toHaveProperty("id", "provider-slack-123");
    });

    it("should update both alias and config", async () => {
      const updated = await updateProvider("provider-gitlab-123", {
        alias: "production-gitlab",
        config: {
          access_token: "glpat-prod-token",
          base_url: "https://gitlab.prod.example.com",
        },
      });

      expect(updated).toHaveProperty("id", "provider-gitlab-123");
    });
  });

  describe("Provider Deletion", () => {
    it("should delete a provider without error", async () => {
      await expect(
        deleteProvider("provider-slack-123")
      ).resolves.not.toThrow();
    });

    it("should delete any provider by ID", async () => {
      await expect(
        deleteProvider("provider-gitlab-123")
      ).resolves.not.toThrow();
    });
  });

  describe("Provider Validation", () => {
    it("should handle required fields in slack provider", async () => {
      const schema = await fetchProviderType("slack");
      const requiredFields = schema.setup_steps.filter((s) => s.required);

      expect(requiredFields.length).toBeGreaterThan(0);

      // Ensure bot_token is required
      const botTokenField = requiredFields.find((f) => f.alias === "bot_token");
      expect(botTokenField).toBeDefined();
    });

    it("should handle optional fields in gitlab provider", async () => {
      const schema = await fetchProviderType("gitlab");
      const optionalFields = schema.setup_steps.filter((s) => !s.required);

      // base_url should be optional
      const baseUrlField = optionalFields.find((f) => f.alias === "base_url");
      expect(baseUrlField).toBeDefined();
    });

    it("should provide defaults for optional fields", async () => {
      const schema = await fetchProviderType("gitlab");
      const baseUrlField = schema.setup_steps.find((s) => s.alias === "base_url");

      expect(baseUrlField?.default).toBeDefined();
      expect(baseUrlField?.default).toBe("https://gitlab.com");
    });
  });

  describe("Provider Field Metadata", () => {
    it("should include descriptions for provider fields", async () => {
      const schema = await fetchProviderType("slack");

      schema.setup_steps.forEach((step) => {
        if (step.description) {
          expect(typeof step.description).toBe("string");
          expect(step.description.length).toBeGreaterThan(0);
        }
      });
    });

    it("should include placeholders for provider fields", async () => {
      const schema = await fetchProviderType("slack");
      const botTokenField = schema.setup_steps.find((s) => s.alias === "bot_token");

      expect(botTokenField?.placeholder).toBeDefined();
      expect(botTokenField?.placeholder).toContain("xoxb");
    });

    it("should have consistent field types", async () => {
      const schema = await fetchProviderType("gitlab");

      const validTypes = ["text", "password", "number", "boolean", "select"];

      schema.setup_steps.forEach((step) => {
        expect(validTypes).toContain(step.type);
      });
    });
  });
});
