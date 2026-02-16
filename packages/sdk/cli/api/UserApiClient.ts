import { getValidAuth } from "../auth/tokenUtils";
import { ApiClient, ApiCallOptions } from "./types";
import {
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  NetworkError,
  ApiError,
} from "./errors";

/**
 * API client for user authentication (OAuth/WorkOS device flow)
 * Supports automatic token refresh on 401 errors
 */
export class UserApiClient implements ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "") + "/api";
  }

  async apiCall<T = any>(
    endpoint: string,
    options: ApiCallOptions = {}
  ): Promise<T> {
    const { method = "GET", body, headers = {} } = options;

    // Get authentication token (excludes FLOWW_TOKEN)
    const auth = await this.getUserAuth();
    if (!auth) {
      throw new UnauthenticatedError(
        "Authentication required. Run `floww auth login` to login."
      );
    }

    // Prepare request
    const url = `${this.baseUrl}${
      endpoint.startsWith("/") ? endpoint : "/" + endpoint
    }`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.accessToken}`,
      ...headers,
    };

    try {
      // Use native fetch (Node 18+) - can be mocked in tests via vi.stubGlobal('fetch')
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle 401 - try to refresh token and retry once
      if (response.status === 401) {
        const refreshedAuth = await this.getUserAuth();
        if (refreshedAuth && refreshedAuth.accessToken !== auth.accessToken) {
          // Retry the request with new token
          requestHeaders.Authorization = `Bearer ${refreshedAuth.accessToken}`;
          const retryResponse = await fetch(url, {
            method,
            headers: requestHeaders,
            body: body ? JSON.stringify(body) : undefined,
          });

          return await this.handleResponse<T>(retryResponse);
        }

        throw new UnauthenticatedError(
          "Authentication failed. Run `floww auth login` to login."
        );
      }

      return await this.handleResponse<T>(response);
    } catch (error) {
      // Re-throw our custom errors
      if (
        error instanceof UnauthenticatedError ||
        error instanceof ForbiddenError ||
        error instanceof NotFoundError ||
        error instanceof ConflictError ||
        error instanceof ApiError
      ) {
        throw error;
      }

      // Network or other errors
      throw new NetworkError(
        error instanceof Error ? error.message : "Network error occurred"
      );
    }
  }

  /**
   * Get user authentication, excluding FLOWW_TOKEN
   */
  private async getUserAuth() {
    // Skip FLOWW_TOKEN and get user auth directly
    if (process.env.FLOWW_TOKEN) {
      // Temporarily unset to get user auth
      const token = process.env.FLOWW_TOKEN;
      delete process.env.FLOWW_TOKEN;
      const auth = await getValidAuth();
      process.env.FLOWW_TOKEN = token;
      return auth;
    }

    return await getValidAuth();
  }

  /**
   * Handle response and throw appropriate errors
   */
  private async handleResponse<T>(response: any): Promise<T> {
    const responseData = await response.json().catch(() => null);

    if (response.ok) {
      return responseData as T;
    }

    // Extract error message
    const errorMessage =
      responseData?.detail || responseData?.error || "Request failed";

    // Throw appropriate error based on status code
    switch (response.status) {
      case 401:
        throw new UnauthenticatedError(errorMessage, responseData);
      case 403:
        throw new ForbiddenError(errorMessage, responseData);
      case 404:
        throw new NotFoundError(errorMessage, responseData);
      case 409:
        throw new ConflictError(errorMessage, responseData);
      default:
        throw new ApiError(response.status, errorMessage, responseData);
    }
  }
}
