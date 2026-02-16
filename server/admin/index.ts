/**
 * AdminJS Admin Panel Setup
 *
 * Provides a web-based admin interface for managing the application.
 */

import AdminJS from 'adminjs';
import { Database, Resource } from 'adminjs-drizzle/pg';
import { Hono } from 'hono';
import { getDb } from '../db';
import * as schema from '../db/schema';
import { buildRouter, buildAuthenticatedRouter } from './hono-adapter';
import { logger } from '~/server/utils/logger';

// Register the Drizzle adapter
AdminJS.registerAdapter({ Database, Resource });

/**
 * Admin panel configuration
 */
export interface AdminConfig {
  rootPath?: string;
  credentials?: {
    email: string;
    password: string;
  };
}

/**
 * Create the AdminJS instance
 */
export async function createAdmin(config: AdminConfig): Promise<AdminJS> {
  const db = getDb();

  const admin = new AdminJS({
    resources: [
      {
        resource: { table: schema.users, db },
        options: {
          navigation: { name: 'User Management', icon: 'User' },
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
            email: { isTitle: true },
            passwordHash: { isVisible: false },
            createdAt: { isVisible: { list: true, edit: false, show: true, filter: true } },
          },
          actions: {
            new: { isAccessible: true },
            edit: { isAccessible: true },
            delete: { isAccessible: true },
          },
        },
      },
      {
        resource: { table: schema.organizations, db },
        options: {
          navigation: { name: 'User Management', icon: 'Building' },
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
            displayName: { isTitle: true },
          },
        },
      },
      {
        resource: { table: schema.organizationMembers, db },
        options: {
          navigation: { name: 'User Management', icon: 'Users' },
        },
      },
      {
        resource: { table: schema.workflows, db },
        options: {
          navigation: { name: 'Workflows', icon: 'Activity' },
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
            name: { isTitle: true },
          },
        },
      },
      {
        resource: { table: schema.workflowDeployments, db },
        options: {
          navigation: { name: 'Workflows', icon: 'Upload' },
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
          },
        },
      },
      {
        resource: { table: schema.executionHistory, db },
        options: {
          navigation: { name: 'Monitoring', icon: 'PlayCircle' },
          listProperties: ['id', 'workflowId', 'status', 'receivedAt', 'completedAt'],
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
          },
          actions: {
            new: { isAccessible: false },
            edit: { isAccessible: false },
          },
        },
      },
      {
        resource: { table: schema.executionLogs, db },
        options: {
          navigation: { name: 'Monitoring', icon: 'FileText' },
          actions: {
            new: { isAccessible: false },
            edit: { isAccessible: false },
          },
        },
      },
      {
        resource: { table: schema.runtimes, db },
        options: {
          navigation: { name: 'Infrastructure', icon: 'Server' },
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
            configHash: { isVisible: { list: false, show: true, edit: false, filter: false } },
          },
        },
      },
      {
        resource: { table: schema.secrets, db },
        options: {
          navigation: { name: 'Security', icon: 'Key' },
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
            encryptedValue: { isVisible: false },
          },
          actions: {
            edit: { isAccessible: false },
          },
        },
      },
      {
        resource: { table: schema.apiKeys, db },
        options: {
          navigation: { name: 'Security', icon: 'Lock' },
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
            hashedKey: { isVisible: false },
          },
        },
      },
      {
        resource: { table: schema.subscriptions, db },
        options: {
          navigation: { name: 'Billing', icon: 'CreditCard' },
          properties: {
            id: { isVisible: { list: true, edit: false, show: true, filter: true } },
          },
        },
      },
      {
        resource: { table: schema.triggers, db },
        options: {
          navigation: { name: 'Workflows', icon: 'Zap' },
        },
      },
      {
        resource: { table: schema.providers, db },
        options: {
          navigation: { name: 'Integrations', icon: 'Box' },
          properties: {
            encryptedConfig: { isVisible: false },
          },
        },
      },
      {
        resource: { table: schema.namespaces, db },
        options: {
          navigation: { name: 'Infrastructure', icon: 'Folder' },
        },
      },
    ],
    rootPath: config.rootPath ?? '/admin',
    branding: {
      companyName: 'Floww',
      logo: '/floww-light-logo.png',
      favicon: '/favicon.ico',
    },
    locale: {
      language: 'en',
      translations: {
        en: {
          labels: {
            users: 'Users',
            organizations: 'Organizations',
            organizationMembers: 'Organization Members',
            workflows: 'Workflows',
            workflowDeployments: 'Deployments',
            executionHistory: 'Executions',
            executionLogs: 'Execution Logs',
            runtimes: 'Runtimes',
            secrets: 'Secrets',
            apiKeys: 'API Keys',
            subscriptions: 'Subscriptions',
            triggers: 'Triggers',
            providers: 'Providers',
            namespaces: 'Namespaces',
          },
        },
      },
    },
  });

  return admin;
}

/**
 * Create admin routes handler using Hono with AdminJS
 */
export async function createAdminRouter(config: AdminConfig): Promise<Hono> {
  const admin = await createAdmin(config);
  
  // If credentials are provided, use authenticated router
  if (config.credentials) {
    return buildAuthenticatedRouter(admin, {
      authenticate: async (email, password) => {
        if (email === config.credentials!.email && password === config.credentials!.password) {
          return { email };
        }
        return null;
      },
    });
  }

  // Otherwise use unauthenticated router
  return buildRouter(admin);
}

/**
 * Build AdminJS bundle for production
 */
export async function buildAdminBundle(config: AdminConfig): Promise<void> {
  const admin = await createAdmin(config);
  await admin.initialize();
  logger.info('AdminJS bundle built');
}
