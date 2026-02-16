import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000, // 30 seconds for E2E tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    globalSetup: ['./tests/setup/run-migrations.ts'], // Runs ONCE before all tests
    setupFiles: [
      './tests/setup/global-setup.ts', // MUST be first - creates test DB connection
      './tests/setup/db-mock.ts',       // MUST be second - mocks getDb() to use test DB
    ],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run tests serially for transaction control
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './'),
    },
  },
});
