export interface ApiCallOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: any;
  headers?: Record<string, string>;
}

/**
 * Interface for API clients that make authenticated requests to the backend
 */
export interface ApiClient {
  /**
   * Make an authenticated API call to the backend
   * @throws {ClientError} When the request fails
   */
  apiCall<T = any>(endpoint: string, options?: ApiCallOptions): Promise<T>;
}
