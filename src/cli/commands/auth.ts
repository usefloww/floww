import { CLIAuth } from "../auth/auth";
import {
  clearTokens,
  loadActiveProfile,
  loadTokens,
  saveProfile,
  saveTokens,
  setActiveProfile,
} from "../auth/authUtils";
import { fetchBackendConfig } from "../config/backendConfig";
import { getConfigValue } from "../config/configUtils";
import { logger } from "../utils/logger";

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
  const profile = loadActiveProfile();
  if (!profile) {
    const oldTokens = loadTokens();
    if (oldTokens) {
      logger.warn(
        "Found old-style auth. Please login again to use the new profile system."
      );
    }
    logger.error('Not logged in. Run "floww login" first.');
    process.exit(1);
  }

  const tokens = profile.auth;
  const now = Date.now();
  const expiresIn = Math.floor((tokens.expiresAt - now) / 1000);
  const isExpired = now >= tokens.expiresAt;

  logger.plain(`Profile: ${profile.name}`);
  logger.plain(`Backend: ${profile.backendUrl}`);
  logger.plain(`Provider: ${profile.config.auth.provider}`);
  logger.plain(`👤 Logged in as: ${tokens.user.email}`);
  logger.plain(`📧 User ID: ${tokens.user.id}`);
  logger.plain(
    `⏰ Token expires: ${new Date(tokens.expiresAt).toLocaleString()}`
  );

  if (isExpired) {
    logger.warn(
      `Token is EXPIRED (expired ${Math.abs(expiresIn)} seconds ago)`
    );
  } else {
    logger.success(
      `Token is valid (expires in ${expiresIn} seconds / ${Math.floor(
        expiresIn / 60
      )} minutes)`
    );
  }

  logger.plain(`🔑 Has refresh token: ${tokens.refreshToken ? "Yes" : "No"}`);
}

export { loginCommand, logoutCommand, whoamiCommand };
