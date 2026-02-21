import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';

export interface ResourceAction {
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export interface ResourceConfig {
  table: PgTable;
  label: string;
  icon: string;
  navigation: { name: string; icon: string };
  titleColumn?: string;
  hiddenColumns: string[];
  readOnlyColumns: string[];
  actions: ResourceAction;
  listColumns?: string[];
}

export const adminResources: Record<string, ResourceConfig> = {
  users: {
    table: schema.users,
    label: 'Users',
    icon: 'User',
    navigation: { name: 'User Management', icon: 'Users' },
    titleColumn: 'email',
    hiddenColumns: ['passwordHash'],
    readOnlyColumns: ['id', 'createdAt', 'updatedAt'],
    actions: { create: true, edit: true, delete: true },
  },
  organizations: {
    table: schema.organizations,
    label: 'Organizations',
    icon: 'Building',
    navigation: { name: 'User Management', icon: 'Users' },
    titleColumn: 'displayName',
    hiddenColumns: [],
    readOnlyColumns: ['id', 'createdAt', 'updatedAt'],
    actions: { create: true, edit: true, delete: true },
  },
  organizationMembers: {
    table: schema.organizationMembers,
    label: 'Organization Members',
    icon: 'Users',
    navigation: { name: 'User Management', icon: 'Users' },
    hiddenColumns: [],
    readOnlyColumns: ['id', 'createdAt'],
    actions: { create: true, edit: true, delete: true },
  },
  workflows: {
    table: schema.workflows,
    label: 'Workflows',
    icon: 'Activity',
    navigation: { name: 'Workflows', icon: 'Workflow' },
    titleColumn: 'name',
    hiddenColumns: [],
    readOnlyColumns: ['id', 'createdAt', 'updatedAt'],
    actions: { create: true, edit: true, delete: true },
  },
  workflowDeployments: {
    table: schema.workflowDeployments,
    label: 'Deployments',
    icon: 'Upload',
    navigation: { name: 'Workflows', icon: 'Workflow' },
    hiddenColumns: [],
    readOnlyColumns: ['id', 'deployedAt'],
    actions: { create: true, edit: true, delete: true },
  },
  triggers: {
    table: schema.triggers,
    label: 'Triggers',
    icon: 'Zap',
    navigation: { name: 'Workflows', icon: 'Workflow' },
    hiddenColumns: [],
    readOnlyColumns: ['id'],
    actions: { create: true, edit: true, delete: true },
  },
  executionHistory: {
    table: schema.executionHistory,
    label: 'Executions',
    icon: 'PlayCircle',
    navigation: { name: 'Monitoring', icon: 'Activity' },
    listColumns: ['id', 'workflowId', 'status', 'receivedAt', 'completedAt'],
    hiddenColumns: [],
    readOnlyColumns: ['id', 'receivedAt', 'startedAt', 'completedAt', 'durationMs'],
    actions: { create: false, edit: false, delete: true },
  },
  executionLogs: {
    table: schema.executionLogs,
    label: 'Execution Logs',
    icon: 'FileText',
    navigation: { name: 'Monitoring', icon: 'Activity' },
    hiddenColumns: [],
    readOnlyColumns: ['id', 'timestamp'],
    actions: { create: false, edit: false, delete: true },
  },
  runtimes: {
    table: schema.runtimes,
    label: 'Runtimes',
    icon: 'Server',
    navigation: { name: 'Infrastructure', icon: 'Server' },
    hiddenColumns: ['configHash'],
    readOnlyColumns: ['id', 'createdAt'],
    actions: { create: true, edit: true, delete: true },
  },
  namespaces: {
    table: schema.namespaces,
    label: 'Namespaces',
    icon: 'Folder',
    navigation: { name: 'Infrastructure', icon: 'Server' },
    hiddenColumns: [],
    readOnlyColumns: ['id', 'createdAt', 'updatedAt'],
    actions: { create: true, edit: true, delete: true },
  },
  secrets: {
    table: schema.secrets,
    label: 'Secrets',
    icon: 'Key',
    navigation: { name: 'Security', icon: 'Shield' },
    hiddenColumns: ['encryptedValue'],
    readOnlyColumns: ['id', 'createdAt', 'updatedAt'],
    actions: { create: true, edit: false, delete: true },
  },
  apiKeys: {
    table: schema.apiKeys,
    label: 'API Keys',
    icon: 'Lock',
    navigation: { name: 'Security', icon: 'Shield' },
    hiddenColumns: ['hashedKey'],
    readOnlyColumns: ['id', 'createdAt', 'lastUsedAt'],
    actions: { create: true, edit: true, delete: true },
  },
  subscriptions: {
    table: schema.subscriptions,
    label: 'Subscriptions',
    icon: 'CreditCard',
    navigation: { name: 'Billing', icon: 'CreditCard' },
    hiddenColumns: [],
    readOnlyColumns: ['id', 'createdAt', 'updatedAt'],
    actions: { create: true, edit: true, delete: true },
  },
  providers: {
    table: schema.providers,
    label: 'Providers',
    icon: 'Box',
    navigation: { name: 'Integrations', icon: 'Box' },
    hiddenColumns: ['encryptedConfig'],
    readOnlyColumns: ['id'],
    actions: { create: true, edit: true, delete: true },
  },
  configurations: {
    table: schema.configurations,
    label: 'Configurations',
    icon: 'Settings',
    navigation: { name: 'Infrastructure', icon: 'Server' },
    titleColumn: 'key',
    hiddenColumns: [],
    readOnlyColumns: ['updatedAt'],
    actions: { create: true, edit: true, delete: true },
  },
};

export interface NavigationGroup {
  name: string;
  icon: string;
  resources: { key: string; label: string; icon: string }[];
}

export function getNavigationGroups(): NavigationGroup[] {
  const groups = new Map<string, NavigationGroup>();

  for (const [key, config] of Object.entries(adminResources)) {
    const groupName = config.navigation.name;
    if (!groups.has(groupName)) {
      groups.set(groupName, {
        name: groupName,
        icon: config.navigation.icon,
        resources: [],
      });
    }
    groups.get(groupName)!.resources.push({
      key,
      label: config.label,
      icon: config.icon,
    });
  }

  return Array.from(groups.values());
}
