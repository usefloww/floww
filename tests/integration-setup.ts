import dotenv from "dotenv";

dotenv.config({ path: ".env.integration-tests" });

const requiredEnvVars: string[] = [
  "FLOWW_TOKEN",
  "FLOWW_BACKEND_URL",
  "FLOWW_WEBSOCKET_URL",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(
      `Missing required environment variable for integration tests: ${envVar}\n` +
        `Please set it before running integration tests.`
    );
  }
}
