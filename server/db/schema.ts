/**
 * Drizzle ORM Schema
 *
 * This schema matches the Python SQLAlchemy models in floww-backend/app/models.py exactly.
 * Any changes here must be synchronized with the Python models.
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  boolean,
  jsonb,
  integer,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { generateUlidUuid } from '../utils/uuid';

// ===== ENUMS =====

export const userTypeEnum = pgEnum('usertype', ['HUMAN', 'SERVICE_ACCOUNT']);

export const organizationRoleEnum = pgEnum('organizationrole', ['OWNER', 'ADMIN', 'MEMBER']);

export const workflowDeploymentStatusEnum = pgEnum('workflowdeploymentstatus', [
  'ACTIVE',
  'INACTIVE',
  'FAILED',
]);

export const runtimeCreationStatusEnum = pgEnum('runtimecreationstatus', [
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'REMOVED',
]);

export const executionStatusEnum = pgEnum('executionstatus', [
  'RECEIVED',
  'STARTED',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
  'NO_DEPLOYMENT',
]);

export const logLevelEnum = pgEnum('loglevel', ['DEBUG', 'INFO', 'WARN', 'ERROR', 'LOG']);

export const subscriptionTierEnum = pgEnum('subscriptiontier', ['FREE', 'HOBBY', 'TEAM']);

export const subscriptionStatusEnum = pgEnum('subscriptionstatus', [
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
]);

export const deviceCodeStatusEnum = pgEnum('devicecodestatus', [
  'PENDING',
  'APPROVED',
  'DENIED',
  'EXPIRED',
]);

export const accessRoleEnum = pgEnum('accessrole', ['OWNER', 'USER']);

export const resourceTypeEnum = pgEnum('resourcetype', ['WORKFLOW', 'FOLDER', 'PROVIDER']);

export const principleTypeEnum = pgEnum('principletype', ['USER', 'WORKFLOW', 'FOLDER']);

// ===== TABLES =====

// Users table
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    userType: userTypeEnum('user_type').notNull().default('HUMAN'),
    workosUserId: varchar('workos_user_id', { length: 255 }).unique(),
    username: varchar('username', { length: 255 }).unique(),
    email: varchar('email', { length: 255 }),
    firstName: varchar('first_name', { length: 255 }),
    lastName: varchar('last_name', { length: 255 }),
    passwordHash: text('password_hash'),
    isAdmin: boolean('is_admin').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  }
);

// Device Codes table (OAuth2 device flow)
export const deviceCodes = pgTable(
  'device_codes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    deviceCode: varchar('device_code', { length: 64 }).notNull().unique(),
    userCode: varchar('user_code', { length: 16 }).notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    status: deviceCodeStatusEnum('status').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_device_codes_device_code').on(table.deviceCode),
    index('idx_device_codes_user_code').on(table.userCode),
    index('idx_device_codes_status').on(table.status),
    index('idx_device_codes_expires_at').on(table.expiresAt),
  ]
);

// Refresh Tokens table
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    deviceName: varchar('device_name', { length: 255 }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_refresh_tokens_token_hash').on(table.tokenHash),
    index('idx_refresh_tokens_user_id').on(table.userId),
    index('idx_refresh_tokens_revoked_at').on(table.revokedAt),
  ]
);

// Organizations table
export const organizations = pgTable('organizations', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUlidUuid()),
  workosOrganizationId: varchar('workos_organization_id', { length: 255 }).unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Organization Members table (junction table)
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organizationRoleEnum('role').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_organization_user').on(table.organizationId, table.userId),
    index('idx_organization_members_organization').on(table.organizationId),
    index('idx_organization_members_user').on(table.userId),
  ]
);

// Subscriptions table
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    organizationId: uuid('organization_id')
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).unique(),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).unique(),
    tier: subscriptionTierEnum('tier').notNull(),
    status: subscriptionStatusEnum('status').notNull(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    gracePeriodEndsAt: timestamp('grace_period_ends_at', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_subscriptions_organization').on(table.organizationId)]
);

// Billing Events table
export const billingEvents = pgTable(
  'billing_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 255 }).notNull(),
    stripeEventId: varchar('stripe_event_id', { length: 255 }).unique(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_billing_events_subscription').on(table.subscriptionId),
    index('idx_billing_events_event_type').on(table.eventType),
    index('idx_billing_events_created_at').on(table.createdAt),
  ]
);

// Namespaces table (polymorphic owner: user OR organization)
export const namespaces = pgTable(
  'namespaces',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    userOwnerId: uuid('user_owner_id').references(() => users.id, { onDelete: 'cascade' }),
    organizationOwnerId: uuid('organization_owner_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'chk_namespace_single_owner',
      sql`(("user_owner_id" IS NOT NULL)::int + ("organization_owner_id" IS NOT NULL)::int = 1)`
    ),
    index('idx_namespaces_user_owner').on(table.userOwnerId),
    index('idx_namespaces_organization_owner').on(table.organizationOwnerId),
  ]
);

// API Keys table
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hashedKey: text('hashed_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('uq_user_api_key_prefix').on(table.userId, table.prefix)]
);

// Runtimes table
export const runtimes = pgTable(
  'runtimes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    config: jsonb('config'),
    configHash: uuid('config_hash').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    creationStatus: runtimeCreationStatusEnum('creation_status').notNull(),
    creationLogs: jsonb('creation_logs'),
  },
  (table) => [uniqueIndex('uq_runtime_config_hash').on(table.configHash)]
);

// Workflow Folders table
export const workflowFolders = pgTable('workflow_folders', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUlidUuid()),
  namespaceId: uuid('namespace_id')
    .notNull()
    .references(() => namespaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  parentFolderId: uuid('parent_folder_id').references((): any => workflowFolders.id, {
    onDelete: 'cascade',
  }),
});

// Workflows table
export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    namespaceId: uuid('namespace_id')
      .notNull()
      .references(() => namespaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    triggersMetadata: jsonb('triggers_metadata'),
    active: boolean('active'),
    parentFolderId: uuid('parent_folder_id').references(() => workflowFolders.id, {
      onDelete: 'cascade',
    }),
  },
  (table) => [
    uniqueIndex('uq_namespace_workflow').on(table.namespaceId, table.name),
    index('idx_workflows_namespace').on(table.namespaceId),
    index('idx_workflows_created_by').on(table.createdById),
    index('idx_workflows_updated_at').on(table.updatedAt),
    index('idx_workflows_active').on(table.active),
  ]
);

// Workflow Deployments table
export const workflowDeployments = pgTable(
  'workflow_deployments',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    runtimeId: uuid('runtime_id')
      .notNull()
      .references(() => runtimes.id, { onDelete: 'restrict' }),
    deployedById: uuid('deployed_by_id').references(() => users.id, { onDelete: 'set null' }),
    userCode: jsonb('user_code').notNull(),
    providerDefinitions: jsonb('provider_definitions'),
    triggerDefinitions: jsonb('trigger_definitions'),
    deployedAt: timestamp('deployed_at').defaultNow().notNull(),
    status: workflowDeploymentStatusEnum('status').notNull(),
    note: text('note'),
    providerMappings: jsonb('provider_mappings'),
  },
  (table) => [
    index('idx_workflow_deployments_workflow').on(table.workflowId),
    index('idx_workflow_deployments_status').on(table.status),
  ]
);

// Providers table
export const providers = pgTable('providers', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUlidUuid()),
  namespaceId: uuid('namespace_id')
    .notNull()
    .references(() => namespaces.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  alias: text('alias').notNull(),
  encryptedConfig: text('encrypted_config').notNull(),
});

// Triggers table
export const triggers = pgTable('triggers', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUlidUuid()),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'restrict' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'restrict' }),
  triggerType: text('trigger_type').notNull(),
  input: jsonb('input').notNull(),
  state: jsonb('state'),
});

// Incoming Webhooks table
export const incomingWebhooks = pgTable(
  'incoming_webhooks',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    triggerId: uuid('trigger_id').references(() => triggers.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    method: text('method').notNull().default('POST'),
  },
  (_table) => [
    check(
      'webhook_owner_check',
      sql`("trigger_id" IS NOT NULL AND "provider_id" IS NULL) OR ("trigger_id" IS NULL AND "provider_id" IS NOT NULL)`
    ),
  ]
);

// Recurring Tasks table
export const recurringTasks = pgTable('recurring_tasks', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUlidUuid()),
  triggerId: uuid('trigger_id')
    .notNull()
    .references(() => triggers.id, { onDelete: 'cascade' }),
});

// Secrets table
export const secrets = pgTable(
  'secrets',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    namespaceId: uuid('namespace_id')
      .notNull()
      .references(() => namespaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 255 }).notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_namespace_secret').on(table.namespaceId, table.name),
    index('idx_secrets_namespace').on(table.namespaceId),
  ]
);

// Key Value Tables table
export const kvTables = pgTable(
  'kv_tables',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_provider_table_name').on(table.providerId, table.name),
    index('idx_kv_tables_provider').on(table.providerId),
  ]
);

// Key Value Table Permissions table
export const kvTablePermissions = pgTable(
  'kv_table_permissions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    tableId: uuid('table_id')
      .notNull()
      .references(() => kvTables.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    canRead: boolean('can_read').notNull().default(true),
    canWrite: boolean('can_write').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_table_workflow_permission').on(table.tableId, table.workflowId),
    index('idx_kv_permissions_table').on(table.tableId),
    index('idx_kv_permissions_workflow').on(table.workflowId),
  ]
);

// Key Value Items table
export const kvItems = pgTable(
  'kv_items',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    tableId: uuid('table_id')
      .notNull()
      .references(() => kvTables.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_table_key').on(table.tableId, table.key),
    index('idx_kv_items_table').on(table.tableId),
    index('idx_kv_items_table_key').on(table.tableId, table.key),
  ]
);

// Execution History table
export const executionHistory = pgTable(
  'execution_history',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    triggerId: uuid('trigger_id').references(() => triggers.id, { onDelete: 'set null' }),
    deploymentId: uuid('deployment_id').references(() => workflowDeployments.id, {
      onDelete: 'set null',
    }),
    triggeredByUserId: uuid('triggered_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: executionStatusEnum('status').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('idx_execution_history_workflow').on(table.workflowId),
    index('idx_execution_history_trigger').on(table.triggerId),
    index('idx_execution_history_deployment').on(table.deploymentId),
    index('idx_execution_history_status').on(table.status),
    index('idx_execution_history_received_at').on(table.receivedAt),
    index('idx_execution_history_workflow_status').on(table.workflowId, table.status),
    index('idx_execution_history_workflow_received').on(table.workflowId, table.receivedAt),
  ]
);

// Execution Logs table
export const executionLogs = pgTable(
  'execution_logs',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    executionHistoryId: uuid('execution_history_id')
      .notNull()
      .references(() => executionHistory.id, { onDelete: 'cascade' }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    logLevel: logLevelEnum('log_level').notNull(),
    message: text('message').notNull(),
  },
  (table) => [
    index('idx_execution_logs_execution_id').on(table.executionHistoryId),
    index('idx_execution_logs_timestamp').on(table.timestamp),
    index('idx_execution_logs_level').on(table.logLevel),
  ]
);

// Configuration table
export const configurations = pgTable('configurations', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Access Tuples table (provider_access)
export const providerAccess = pgTable(
  'provider_access',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUlidUuid()),
    resourceType: resourceTypeEnum('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    principleType: principleTypeEnum('principle_type').notNull(),
    principleId: uuid('principle_id').notNull(),
    role: accessRoleEnum('role').notNull(),
  },
  (table) => [
    uniqueIndex('uq_access_principal_resource').on(
      table.principleType,
      table.principleId,
      table.resourceType,
      table.resourceId
    ),
    index('idx_access_principal').on(table.principleType, table.principleId),
    index('idx_access_resource').on(table.resourceType, table.resourceId),
  ]
);

// ===== RELATIONS =====

export const usersRelations = relations(users, ({ many }) => ({
  organizationMemberships: many(organizationMembers),
  createdWorkflows: many(workflows),
  deployments: many(workflowDeployments),
  ownedNamespaces: many(namespaces),
  apiKeys: many(apiKeys),
  deviceCodes: many(deviceCodes),
  refreshTokens: many(refreshTokens),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  members: many(organizationMembers),
  ownedNamespaces: many(namespaces),
  subscription: one(subscriptions, {
    fields: [organizations.id],
    references: [subscriptions.organizationId],
  }),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  billingEvents: many(billingEvents),
}));

export const billingEventsRelations = relations(billingEvents, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [billingEvents.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const namespacesRelations = relations(namespaces, ({ one, many }) => ({
  userOwner: one(users, {
    fields: [namespaces.userOwnerId],
    references: [users.id],
  }),
  organizationOwner: one(organizations, {
    fields: [namespaces.organizationOwnerId],
    references: [organizations.id],
  }),
  workflows: many(workflows),
  secrets: many(secrets),
  providers: many(providers),
}));

export const workflowFoldersRelations = relations(workflowFolders, ({ one, many }) => ({
  namespace: one(namespaces, {
    fields: [workflowFolders.namespaceId],
    references: [namespaces.id],
  }),
  parentFolder: one(workflowFolders, {
    fields: [workflowFolders.parentFolderId],
    references: [workflowFolders.id],
    relationName: 'parentChild',
  }),
  subfolders: many(workflowFolders, { relationName: 'parentChild' }),
  workflows: many(workflows),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  namespace: one(namespaces, {
    fields: [workflows.namespaceId],
    references: [namespaces.id],
  }),
  parentFolder: one(workflowFolders, {
    fields: [workflows.parentFolderId],
    references: [workflowFolders.id],
  }),
  createdBy: one(users, {
    fields: [workflows.createdById],
    references: [users.id],
  }),
  deployments: many(workflowDeployments),
  triggers: many(triggers),
  kvTablePermissions: many(kvTablePermissions),
  executionHistory: many(executionHistory),
}));

export const workflowDeploymentsRelations = relations(workflowDeployments, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowDeployments.workflowId],
    references: [workflows.id],
  }),
  runtime: one(runtimes, {
    fields: [workflowDeployments.runtimeId],
    references: [runtimes.id],
  }),
  deployedBy: one(users, {
    fields: [workflowDeployments.deployedById],
    references: [users.id],
  }),
}));

export const runtimesRelations = relations(runtimes, ({ many }) => ({
  deployments: many(workflowDeployments),
}));

export const providersRelations = relations(providers, ({ one, many }) => ({
  namespace: one(namespaces, {
    fields: [providers.namespaceId],
    references: [namespaces.id],
  }),
  triggers: many(triggers),
  incomingWebhooks: many(incomingWebhooks),
  kvTables: many(kvTables),
}));

export const triggersRelations = relations(triggers, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [triggers.workflowId],
    references: [workflows.id],
  }),
  provider: one(providers, {
    fields: [triggers.providerId],
    references: [providers.id],
  }),
  incomingWebhooks: many(incomingWebhooks),
  recurringTasks: many(recurringTasks),
}));

export const incomingWebhooksRelations = relations(incomingWebhooks, ({ one }) => ({
  trigger: one(triggers, {
    fields: [incomingWebhooks.triggerId],
    references: [triggers.id],
  }),
  provider: one(providers, {
    fields: [incomingWebhooks.providerId],
    references: [providers.id],
  }),
}));

export const recurringTasksRelations = relations(recurringTasks, ({ one }) => ({
  trigger: one(triggers, {
    fields: [recurringTasks.triggerId],
    references: [triggers.id],
  }),
}));

export const secretsRelations = relations(secrets, ({ one }) => ({
  namespace: one(namespaces, {
    fields: [secrets.namespaceId],
    references: [namespaces.id],
  }),
}));

export const kvTablesRelations = relations(kvTables, ({ one, many }) => ({
  provider: one(providers, {
    fields: [kvTables.providerId],
    references: [providers.id],
  }),
  items: many(kvItems),
  permissions: many(kvTablePermissions),
}));

export const kvTablePermissionsRelations = relations(kvTablePermissions, ({ one }) => ({
  table: one(kvTables, {
    fields: [kvTablePermissions.tableId],
    references: [kvTables.id],
  }),
  workflow: one(workflows, {
    fields: [kvTablePermissions.workflowId],
    references: [workflows.id],
  }),
}));

export const kvItemsRelations = relations(kvItems, ({ one }) => ({
  table: one(kvTables, {
    fields: [kvItems.tableId],
    references: [kvTables.id],
  }),
}));

export const executionHistoryRelations = relations(executionHistory, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [executionHistory.workflowId],
    references: [workflows.id],
  }),
  trigger: one(triggers, {
    fields: [executionHistory.triggerId],
    references: [triggers.id],
  }),
  deployment: one(workflowDeployments, {
    fields: [executionHistory.deploymentId],
    references: [workflowDeployments.id],
  }),
  triggeredByUser: one(users, {
    fields: [executionHistory.triggeredByUserId],
    references: [users.id],
  }),
  logEntries: many(executionLogs),
}));

export const executionLogsRelations = relations(executionLogs, ({ one }) => ({
  execution: one(executionHistory, {
    fields: [executionLogs.executionHistoryId],
    references: [executionHistory.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const deviceCodesRelations = relations(deviceCodes, ({ one }) => ({
  user: one(users, {
    fields: [deviceCodes.userId],
    references: [users.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

// ===== TYPE EXPORTS =====

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type BillingEvent = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;

export type Namespace = typeof namespaces.$inferSelect;
export type NewNamespace = typeof namespaces.$inferInsert;

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

export type WorkflowFolder = typeof workflowFolders.$inferSelect;
export type NewWorkflowFolder = typeof workflowFolders.$inferInsert;

export type WorkflowDeployment = typeof workflowDeployments.$inferSelect;
export type NewWorkflowDeployment = typeof workflowDeployments.$inferInsert;

export type Runtime = typeof runtimes.$inferSelect;
export type NewRuntime = typeof runtimes.$inferInsert;

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type Trigger = typeof triggers.$inferSelect;
export type NewTrigger = typeof triggers.$inferInsert;

export type IncomingWebhook = typeof incomingWebhooks.$inferSelect;
export type NewIncomingWebhook = typeof incomingWebhooks.$inferInsert;

export type RecurringTask = typeof recurringTasks.$inferSelect;
export type NewRecurringTask = typeof recurringTasks.$inferInsert;

export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;

export type KvTable = typeof kvTables.$inferSelect;
export type NewKvTable = typeof kvTables.$inferInsert;

export type KvTablePermission = typeof kvTablePermissions.$inferSelect;
export type NewKvTablePermission = typeof kvTablePermissions.$inferInsert;

export type KvItem = typeof kvItems.$inferSelect;
export type NewKvItem = typeof kvItems.$inferInsert;

export type ExecutionHistoryRecord = typeof executionHistory.$inferSelect;
export type NewExecutionHistoryRecord = typeof executionHistory.$inferInsert;

export type ExecutionLog = typeof executionLogs.$inferSelect;
export type NewExecutionLog = typeof executionLogs.$inferInsert;

export type Configuration = typeof configurations.$inferSelect;
export type NewConfiguration = typeof configurations.$inferInsert;

export type ProviderAccessRecord = typeof providerAccess.$inferSelect;
export type NewProviderAccessRecord = typeof providerAccess.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type DeviceCode = typeof deviceCodes.$inferSelect;
export type NewDeviceCode = typeof deviceCodes.$inferInsert;

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
