import { CLIAuth } from "../auth/auth";
import {
  clearTokens,
  loadActiveProfile,
  saveProfile,
  setActiveProfile,
} from "../auth/authUtils";
import { fetchBackendConfig } from "../config/backendConfig";
import { getConfigValue } from "../config/configUtils";
import { logger } from "../utils/logger";
import { defaultApiClient } from "../api/client";
import chalk from "chalk";

async function loginCommand() {
  const backendUrl = getConfigValue("backendUrl");

  logger.info(`Connecting to ${backendUrl}...`);

  try {
    const config = await fetchBackendConfig(backendUrl);
    logger.success(`Connected to backend (provider: ${config.auth.provider})`);

    const auth = new CLIAuth(config);
    const tokens = await auth.login();

    saveProfile(backendUrl, config, tokens);
    setActiveProfile(backendUrl);

    logger.success("Credentials saved securely");
    logger.plain(`Active profile: ${new URL(backendUrl).hostname}`);
  } catch (error) {
    logger.error("Login failed:", error);
    process.exit(1);
  }
}

async function logoutCommand() {
  clearTokens();
  logger.success("Logged out successfully");
}

async function whoamiCommand() {
  const client = defaultApiClient();
  const user = await client.apiCall<any>("/whoami");

  const profile = loadActiveProfile();

  // Helper function to format labels with consistent width
  const formatLabel = (label: string) => {
    return chalk.gray(label.padEnd(12));
  };

  // Display user information in a nice format
  console.log("\n" + chalk.bold.cyan("👤 User Information"));
  console.log(chalk.gray("─".repeat(50)));

  // Don't show email for service accounts
  if (user.userType !== "SERVICE_ACCOUNT") {
    console.log(
      `  ${formatLabel("Email:")}${
        user.email ? chalk.white.bold(user.email) : chalk.dim("N/A")
      }`
    );
  }

  if (user.firstName || user.lastName) {
    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ");
    console.log(`  ${formatLabel("Name:")}${chalk.white(fullName)}`);
  }

  console.log(`  ${formatLabel("User ID:")}${chalk.dim(user.id)}`);

  if (user.userType) {
    const userTypeColor =
      user.userType === "HUMAN" ? chalk.green : chalk.blue;
    console.log(`  ${formatLabel("Type:")}${userTypeColor(user.userType)}`);
  }

  if (user.createdAt) {
    const createdAt = new Date(user.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    console.log(`  ${formatLabel("Created on:")}${chalk.white(createdAt)}`);
  }

  console.log(chalk.gray("─".repeat(50)));
  console.log(chalk.bold.cyan("\n🔗 Connection"));
  console.log(chalk.gray("─".repeat(50)));

  if (profile) {
    console.log(
      `  ${formatLabel("Backend:")}${chalk.cyan(profile.backendUrl)}`
    );
    console.log(
      `  ${formatLabel("Profile:")}${chalk.white(new URL(profile.backendUrl).hostname)}`
    );
  } else if (process.env.FLOWW_TOKEN) {
    const backendUrl = getConfigValue("backendUrl");
    console.log(`  ${formatLabel("Backend:")}${chalk.cyan(backendUrl)}`);
    console.log(
      `  ${formatLabel("Auth:")}${chalk.yellow("FLOWW_TOKEN (API Key)")}`
    );
  }

  console.log();
}

export { loginCommand, logoutCommand, whoamiCommand };
