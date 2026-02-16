// Base types matching backend models

export interface Organization {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationCreate {
  displayName: string;
}

export interface OrganizationUpdate {
  displayName?: string;
}

export enum OrganizationRole {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member"
}

export interface OrganizationUser {
  id: string;
  workosUserId: string | null;
  email?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string;
  user: OrganizationUser;
}

export interface OrganizationMemberCreate {
  userId: string;
  role: OrganizationRole;
}

export interface OrganizationMemberUpdate {
  role: OrganizationRole;
}

// Invitation types
export interface Invitation {
  id: string;
  email: string;
  state: string;
  createdAt: string;
  expiresAt: string;
}

export interface InvitationCreate {
  email: string;
  role?: string;
  expiresInDays?: number;
}

// SSO types
export interface SSOSetupRequest {
  returnUrl?: string;
  successUrl?: string;
}

export interface SSOSetupResponse {
  adminPortalLink: string;
}

export interface CreatedByUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  namespaceId: string;
  parentFolderId?: string | null;
  createdById: string;
  createdBy?: CreatedByUser;
  createdAt: string;
  updatedAt: string;
  active?: boolean | null;
  lastDeployment?: {
    deployedAt: string;
    providerDefinitions?: { type: string; alias: string }[];
  } | null;
}

export interface WorkflowCreate {
  name: string;
  namespaceId: string;
  description?: string;
  parentFolderId?: string;
}

export interface WorkflowUpdate {
  name?: string;
  description?: string;
  namespaceId?: string;
  parentFolderId?: string | null;
  active?: boolean;
}

// Folder types
export interface Folder {
  id: string;
  namespaceId: string;
  name: string;
  parentFolderId: string | null;
}

export interface FolderCreate {
  namespaceId: string;
  name: string;
  parentFolderId?: string;
}

export interface FolderUpdate {
  name?: string;
  parentFolderId?: string | null;
}

export interface FolderWithPath extends Folder {
  path: Folder[];
}

export interface FoldersListResponse {
  results: Folder[];
}

export interface Provider {
  id: string;
  alias: string;
  type: string;
  namespaceId: string;
  config: Record<string, any>;
  // Optional fields that may not be present in backend response
  status?: 'connected' | 'disconnected' | 'pending';
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  // Legacy field name for compatibility
  name?: string;
  configuration?: Record<string, string | number | boolean>;
}

export interface ProviderCreate {
  namespaceId: string;
  type: string;
  alias: string;
  config: Record<string, any>;
}

export interface ProviderUpdate {
  type?: string;
  alias?: string;
  config?: Record<string, any>;
}

export interface ProviderSetupStep {
  type: "value" | "secret" | "oauth" | "choice" | "file" | "info" | "webhook";
  title: string;
  description?: string;
  alias: string;
  required?: boolean;
  placeholder?: string;
  default?: string;
  // For choice type
  options?: string[];
  // For oauth type
  providerName?: string;
  scopes?: string[];
  redirectUri?: string;
  // For info type
  message?: string;
  actionText?: string;
  actionUrl?: string;
}

export interface ProviderType {
  providerType: string;
  setupSteps: ProviderSetupStep[];
}

export interface Namespace {
  id: string;
  user?: {
    id: string;
  };
  organization?: {
    id: string;
    displayName: string;
  };
}

// User from whoami endpoint
export interface User {
  id: string;
  workosUserId: string | null;
  userType: 'HUMAN' | 'SERVICE_ACCOUNT';
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin: boolean;
  createdAt: string | null;
}

// Generic list response wrapper
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// API Error response
export interface ApiErrorResponse {
  detail: string;
  message?: string;
}

export enum WorkflowDeploymentStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  FAILED = "failed",
}

export interface WorkflowDeployment {
  id: string;
  workflowId: string;
  runtimeId: string;
  deployedById?: string | null;
  userCode: {
    files: Record<string, string>;
    entrypoint: string;
  };
  status: WorkflowDeploymentStatus;
  deployedAt: string;
  note?: string | null;
  webhooks?: Array<{
    id: string;
    url: string;
    path?: string | null;
    method?: string | null;
  }> | null;
}

export interface WorkflowDeploymentsResponse {
  deployments: WorkflowDeployment[];
}

// Service Account types
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

export interface ApiKeyCreatedResponse extends ApiKey {
  apiKey: string;
}

export interface ServiceAccount {
  id: string;
  name: string;
  organizationId: string;
  apiKeys: ApiKey[];
}

export interface ServiceAccountCreate {
  name: string;
  organizationId: string;
}

export interface ServiceAccountUpdate {
  name?: string;
}

export interface ApiKeyCreate {
  name: string;
}

export interface ServiceAccountsListResponse {
  results: ServiceAccount[];
}

export type ExecutionStatus =
  | "received"
  | "started"
  | "completed"
  | "failed"
  | "timeout"
  | "no_deployment";

export type LogLevel = "debug" | "info" | "warn" | "error" | "log";

export interface ExecutionLogEntry {
  id: string;
  executionId: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface ExecutionHistory {
  id: string;
  workflowId: string;
  triggerId: string | null;
  deploymentId: string | null;
  status: ExecutionStatus;
  receivedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  logEntries: ExecutionLogEntry[] | null;
  triggerType: string | null;
  webhookPath: string | null;
  webhookMethod: string | null;
}

export interface ExecutionHistoryResponse {
  executions: ExecutionHistory[];
  total: number;
}

export interface WorkflowLogsResponse {
  workflowId: string;
  logs: ExecutionLogEntry[];
  limit: number;
  offset: number;
}

export interface ExecutionDaySummary {
  date: string;
  total: number;
  completed: number;
  failed: number;
  started: number;
  received: number;
  timeout: number;
  noDeployment: number;
}

export interface SummaryResponse {
  executionsByDay: ExecutionDaySummary[];
  totalExecutions: number;
  totalCompleted: number;
  totalFailed: number;
  periodDays: number;
}

// Access Control types
export enum AccessRole {
  OWNER = "owner",
  USER = "user",
}

export enum PrincipleType {
  USER = "user",
  WORKFLOW = "workflow",
  FOLDER = "folder",
}

export enum ResourceType {
  WORKFLOW = "workflow",
  FOLDER = "folder",
  PROVIDER = "provider",
}

export interface ProviderAccessEntry {
  id: string;
  userId: string;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
  role: AccessRole;
}

export interface ProviderAccessListResponse {
  results: ProviderAccessEntry[];
}

export interface GrantUserProviderAccessRequest {
  userId: string;
  role: AccessRole;
}

export interface UpdateAccessRoleRequest {
  role: AccessRole;
}
