import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Using projects to separate unit and integration tests
    projects: [
      {
        // Unit tests project
        test: {
          name: "unit",
          environment: "node",
          globals: true,
          testTimeout: 30000,
          hookTimeout: 30000,
          setupFiles: ["./tests/setup.ts"],
          exclude: ["tests/integration/**/*.test.ts", "**/node_modules/**"],
        },
      },
      {
        // Integration tests project
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          testTimeout: 100000,
          hookTimeout: 100000,
          setupFiles: ["./tests/integration-setup.ts"],
          include: ["tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
