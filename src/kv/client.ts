import type {
  KVItem,
  Permission,
  TableListResponse,
  KeyListResponse,
  KeysWithValuesResponse,
  GrantPermissionRequest,
} from './types';
import { KVError } from './types';
import type { ExecutionContext } from '../cli/runtime/ExecutionContext';

export class KVStore {
  constructor(
    private backendUrl: string,
    private context: ExecutionContext
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    const url = `${this.backendUrl}/api${path}`;
    const authToken = this.context.getAuthToken();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${authToken || ''}`,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throw new KVError(
        errorData.detail || `KV store request failed: ${response.statusText}`,
        response.status,
        errorData
      );
    }

    return response.json() as Promise<T>;
  }

  // Table operations
  async listTables(): Promise<string[]> {
    const result = await this.request<TableListResponse>('GET', '/kv');
    return result.tables;
  }

  // Key operations
  async listKeys(table: string): Promise<string[]> {
    const result = await this.request<KeyListResponse>('GET', `/kv/${table}`);
    return result.keys;
  }

  async listItems<T = any>(table: string): Promise<KVItem<T>[]> {
    const result = await this.request<KeysWithValuesResponse<T>>(
      'GET',
      `/kv/${table}?include_values=true`
    );
    return result.items;
  }

  // Value operations
  async get<T = any>(table: string, key: string): Promise<T> {
    const result = await this.request<KVItem<T>>('GET', `/kv/${table}/${key}`);
    return result.value;
  }

  async set<T = any>(table: string, key: string, value: T): Promise<void> {
    await this.request('PUT', `/kv/${table}/${key}`, { value });
  }

  async delete(table: string, key: string): Promise<void> {
    await this.request('DELETE', `/kv/${table}/${key}`);
  }

  // Permission operations
  async listPermissions(table: string): Promise<Permission[]> {
    return this.request<Permission[]>('GET', `/kv/permissions/${table}`);
  }

  async grantPermission(
    table: string,
    workflowId: string,
    options: { read?: boolean; write?: boolean } = {}
  ): Promise<Permission> {
    const request: GrantPermissionRequest = {
      workflow_id: workflowId,
      can_read: options.read ?? true,
      can_write: options.write ?? false,
    };
    return this.request<Permission>('POST', `/kv/permissions/${table}`, request);
  }

  async revokePermission(table: string, workflowId: string): Promise<void> {
    await this.request('DELETE', `/kv/permissions/${table}/${workflowId}`);
  }
}
