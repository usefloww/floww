import { ProviderType, WorkflowUpdate } from "@/types/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: Response,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
  timeout?: number;
}

// Helper function to format structured error objects
function formatStructuredError(error: any): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object') {
    // Handle trigger errors with failedTriggers
    if (error.failedTriggers && Array.isArray(error.failedTriggers)) {
      const triggerErrors = error.failedTriggers.map((trigger: any) => {
        const parts = [];
        if (trigger.providerType) parts.push(`Provider: ${trigger.providerType}`);
        if (trigger.triggerType) parts.push(`Trigger: ${trigger.triggerType}`);
        if (trigger.error) parts.push(`Error: ${trigger.error}`);
        return parts.join(', ');
      });
      const baseMessage = error.message || 'Failed to create one or more triggers';
      return `${baseMessage}\n${triggerErrors.join('\n')}`;
    }
    
    // Handle simple message objects
    if (error.message) {
      return error.message;
    }
    
    // Fallback: format as JSON for debugging
    return JSON.stringify(error, null, 2);
  }
  
  return String(error);
}

class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number = 10000; // 10 seconds

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    console.log('[ApiClient] Requesting:', endpoint);
    const {
      params,
      timeout = this.defaultTimeout,
      headers: customHeaders,
      ...requestOptions
    } = options;

    // Build URL with query parameters
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
      url += `?${searchParams.toString()}`;
    }

    // Default headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    // Setup request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...requestOptions,
        headers,
        credentials: 'include', // Always include cookies for auth
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-JSON responses
      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`;
        let errorData: any = null;
        try {
          errorData = await response.json();
          // Extract message from error data
          if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.detail) {
            // If detail is an object, format it nicely
            errorMessage = formatStructuredError(errorData.detail);
          }
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new ApiError(errorMessage, response.status, response, errorData);
      }

      // Handle empty responses (like 204 No Content)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return {} as T;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ApiError('Request timeout', 408);
        }
        throw new ApiError(error.message, 0);
      }

      throw new ApiError('Unknown error occurred', 0);
    }
  }

  // HTTP method shortcuts
  async get<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string,
    data?: any,
    options?: ApiRequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(
    endpoint: string,
    data?: any,
    options?: ApiRequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(
    endpoint: string,
    data?: any,
    options?: ApiRequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// Create default API client instance
export const api = new ApiClient();

// Create root-level API client for OAuth routes (not under /api)
const rootApi = new ApiClient('');

// Helper function to handle API errors in components
export const handleApiError = (error: unknown): string => {
  if (error instanceof ApiError) {
    // If we have structured error data, format it nicely
    if (error.data?.detail && typeof error.data.detail === 'object') {
      return formatStructuredError(error.data.detail);
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

// Provider API methods
export async function getProviderType(providerType: string): Promise<ProviderType> {
  return api.get<ProviderType>(`/provider-types/${providerType}`);
}

export async function createProvider(data: { namespaceId: string; type: string; alias: string; config: Record<string, any> }) {
  return api.post<any>("/providers", data);
}

export async function updateProvider(providerId: string, data: { type?: string; alias?: string; config?: Record<string, any> }) {
  return api.patch<any>(`/providers/${providerId}`, data);
}

export async function deleteProvider(providerId: string) {
  return api.delete<void>(`/providers/${providerId}`);
}

// Workflow API methods
export async function updateWorkflow(workflowId: string, data: WorkflowUpdate) {
  return api.patch<any>(`/workflows/${workflowId}`, data);
}

export async function deleteWorkflow(workflowId: string) {
  return api.delete<void>(`/workflows/${workflowId}`);
}

// Manual Trigger API methods
export interface ManualTriggerInfo {
  id: string;
  name: string;
  description: string | null;
  inputSchema: Record<string, any> | null;
  executionCount: number;
}

export interface ManualTriggersListResponse {
  triggers: ManualTriggerInfo[];
}

export interface ManualTriggerInvokeRequest {
  inputData: Record<string, any>;
}

export interface ManualTriggerInvokeResponse {
  executionId: string;
  status: string;
}

export async function getManualTriggers(workflowId: string): Promise<ManualTriggersListResponse> {
  return api.get<ManualTriggersListResponse>(`/triggers/workflows/${workflowId}/manual`);
}

export async function invokeManualTrigger(
  triggerId: string,
  inputData: Record<string, any> = {}
): Promise<ManualTriggerInvokeResponse> {
  return api.post<ManualTriggerInvokeResponse>(`/triggers/${triggerId}/invoke`, {
    inputData: inputData,
  });
}

// OAuth API methods
// Note: OAuth routes are at root level, not under /api
export interface OAuthAuthorizeResponse {
  authUrl: string;
}

export async function getOAuthAuthorizeUrl(providerName: string, providerId: string): Promise<OAuthAuthorizeResponse> {
  return rootApi.get<OAuthAuthorizeResponse>(`/oauth/${providerName}/authorize`, {
    params: { providerId },
  });
}