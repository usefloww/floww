import {
  loadActiveProfile,
  loadTokens,
  saveProfile,
  saveTokens,
} from "./authUtils";
import { CLIAuth } from "./auth";
import { StoredAuth } from "./authTypes";
import { getConfig } from "../config/configUtils";

export async function getAuthToken(): Promise<string | null> {
  const auth = await getValidAuth();
  return auth?.accessToken || null;
}

export async function getValidAuth(): Promise<StoredAuth | null> {
  const profile = loadActiveProfile();

  if (profile) {
    const auth = profile.auth;
    const bufferMs = 10 * 60 * 1000;
    const isExpired = Date.now() >= auth.expiresAt - bufferMs;

    if (isExpired && auth.refreshToken) {
      return await refreshTokenWithProfile(profile);
    }

    return auth;
  }

  const auth = loadTokens();
  if (!auth) {
    return null;
  }

  const bufferMs = 10 * 60 * 1000;
  const isExpired = Date.now() >= auth.expiresAt - bufferMs;

  if (isExpired && auth.refreshToken) {
    return await refreshTokenLegacy(auth);
  }

  return auth;
}

async function refreshTokenWithProfile(
  profile: any
): Promise<StoredAuth | null> {
  if (!profile.auth.refreshToken) {
    return null;
  }

  try {
    const cliAuth = new CLIAuth(profile.config);
    const refreshedAuth = await cliAuth.refreshAccessToken(
      profile.auth.refreshToken
    );

    saveProfile(profile.backendUrl, profile.config, refreshedAuth);

    return refreshedAuth;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return null;
  }
}

async function refreshTokenLegacy(auth: StoredAuth): Promise<StoredAuth | null> {
  if (!auth.refreshToken) {
    return null;
  }

  try {
    const config = getConfig();
    const apiUrl = config.workosApiUrl || "https://api.workos.com";

    const cliAuth = new CLIAuth({
      auth: {
        provider: "workos",
        client_id: config.workosClientId,
        device_authorization_endpoint: `${apiUrl}/user_management/authorize/device`,
        token_endpoint: `${apiUrl}/user_management/authenticate`,
        authorization_endpoint: `${apiUrl}/user_management/authorize`,
        issuer: `${apiUrl}/user_management`,
      },
      websocket_url: config.websocketUrl || "wss://ws.usefloww.dev/connection/websocket",
    });
    const refreshedAuth = await cliAuth.refreshAccessToken(auth.refreshToken);

    saveTokens(refreshedAuth);

    return refreshedAuth;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return null;
  }
}
