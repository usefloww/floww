/**
 * API Types
 *
 * Re-exports from @floww/api-contract — the single source of truth.
 * This file exists for backward compatibility so existing dashboard imports continue to work.
 */

// Organization types
export type {
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
  OrganizationUser,
  OrganizationMember,
  OrganizationMemberCreate,
  OrganizationMemberUpdate,
  Invitation,
  InvitationCreate,
  SSOSetupRequest,
  SSOSetupResponse,
} from '@floww/api-contract';
export { OrganizationRole } from '@floww/api-contract';

// Workflow types
export type {
  CreatedByUser,
  Workflow,
  WorkflowCreate,
  WorkflowUpdate,
  Folder,
  FolderCreate,
  FolderUpdate,
  FolderWithPath,
  FoldersListResponse,
} from '@floww/api-contract';

// Provider types
export type {
  Provider,
  ProviderCreate,
  ProviderUpdate,
  ProviderSetupStep,
  ProviderType,
} from '@floww/api-contract';

// Deployment types
export type {
  WorkflowDeployment,
  WorkflowDeploymentsResponse,
} from '@floww/api-contract';
export { WorkflowDeploymentStatus } from '@floww/api-contract';

// Namespace & User types
export type { Namespace, User } from '@floww/api-contract';

// Execution types
export type {
  ExecutionStatus,
  LogLevel,
  ExecutionLogEntry,
  ExecutionHistory,
  ExecutionHistoryResponse,
  WorkflowLogsResponse,
  ExecutionDaySummary,
  SummaryResponse,
} from '@floww/api-contract';

// Service Account types
export type {
  ApiKey,
  ApiKeyCreatedResponse,
  ServiceAccount,
  ServiceAccountCreate,
  ServiceAccountUpdate,
  ApiKeyCreate,
  ServiceAccountsListResponse,
} from '@floww/api-contract';

// Access Control types
export type {
  ProviderAccessEntry,
  ProviderAccessListResponse,
  GrantUserProviderAccessRequest,
  UpdateAccessRoleRequest,
} from '@floww/api-contract';
export { AccessRole, PrincipleType, ResourceType } from '@floww/api-contract';

// Error types
export type { ApiErrorResponse } from '@floww/api-contract';

// Generic list response wrapper (kept locally as it uses generics)
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
