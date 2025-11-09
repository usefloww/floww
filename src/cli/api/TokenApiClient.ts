// Import fetch dynamically to handle ES module issues in bundled CLI
async function getFetch() {
  const { default: fetch } = await import("node-fetch");
  return fetch;
}

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
 * API client for token-based authentication (FLOWW_TOKEN)
 * Does NOT support automatic token refresh - tokens are long-lived
 */
export class TokenApiClient implements ApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    if (!token) {
      throw new Error("Token is required for TokenApiClient");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "") + "/api";
    this.token = token;
  }

  async apiCall<T = any>(
    endpoint: string,
    options: ApiCallOptions = {}
  ): Promise<T> {
    const { method = "GET", body, headers = {} } = options;

    // Prepare request
    const url = `${this.baseUrl}${
      endpoint.startsWith("/") ? endpoint : "/" + endpoint
    }`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      ...headers,
    };

    try {
      const fetch = await getFetch();
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

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
        throw new UnauthenticatedError(
          "Invalid API token. Please check your FLOWW_TOKEN environment variable.",
          responseData
        );
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
