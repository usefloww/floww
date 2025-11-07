export interface KVItem<T = any> {
  key: string;
  value: T;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  workflow_id: string;
  can_read: boolean;
  can_write: boolean;
  created_at: string;
}

export interface TableListResponse {
  tables: string[];
}

export interface KeyListResponse {
  keys: string[];
}

export interface KeysWithValuesResponse<T = any> {
  items: KVItem<T>[];
}

export interface GrantPermissionRequest {
  workflow_id: string;
  can_read?: boolean;
  can_write?: boolean;
}

export class KVError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'KVError';
  }
}
