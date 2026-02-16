export interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  // User field is optional - standard OIDC token endpoints don't return user info
  // User data is fetched separately from /whoami endpoint after authentication
  user?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

export interface StoredAuth {
  accessToken: string;
  refreshToken?: string;
  user: any;
  expiresAt: number;
}
