export interface BaseAuthConfig {
  provider: string;
  client_id: string;
  device_authorization_endpoint?: string;
  token_endpoint?: string;
  authorization_endpoint?: string;
  issuer?: string;
  jwks_uri?: string;
  audience?: string;
}

export type AuthConfig = BaseAuthConfig;

export interface BackendConfig {
  auth: AuthConfig;
  websocket_url: string;
}

export async function fetchBackendConfig(
  backendUrl: string
): Promise<BackendConfig> {
  const configUrl = `${backendUrl}/api/config`;

  try {
    const response = await fetch(configUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch config from ${configUrl}: ${response.statusText}`
      );
    }

    const config = (await response.json()) as BackendConfig;
    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Could not connect to Floww backend at ${backendUrl}: ${error.message}\n` +
          `Please check that the backend URL is correct and the server is running.`
      );
    }
    throw error;
  }
}
