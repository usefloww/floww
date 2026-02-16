/**
 * Test factories for creating test data
 *
 * These factories use the test database connection and create data
 * that will be rolled back after each test.
 */

import { getTestDb } from '../setup/global-setup';
import {
  users,
  organizations,
  organizationMembers,
  namespaces,
  workflows,
  workflowDeployments,
  runtimes,
  providers,
  subscriptions,
  type NewUser,
  type NewOrganization,
  type NewNamespace,
  type NewWorkflow,
  type NewRuntime,
  type NewProvider,
  type NewWorkflowDeployment,
} from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';

// Counter to ensure unique values even within same millisecond
let testCounter = 0;
function uniqueId(): string {
  return `${Date.now()}-${++testCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a test user
 */
export async function createTestUser(data: Partial<NewUser> = {}) {
  const db = getTestDb();
  const id = uniqueId();
  const [user] = await db
    .insert(users)
    .values({
      email: data.email || `test-${id}@example.com`,
      username: data.username || `testuser-${id}`,
      firstName: data.firstName || 'Test',
      lastName: data.lastName || 'User',
      userType: data.userType || 'HUMAN',
      isAdmin: data.isAdmin ?? false,
      ...data,
    })
    .returning();

  return user;
}

/**
 * Create a test organization
 */
export async function createTestOrganization(data: Partial<NewOrganization> = {}) {
  const db = getTestDb();
  const [org] = await db
    .insert(organizations)
    .values({
      displayName: data.displayName || `Test Org ${Date.now()}`,
      ...data,
    })
    .returning();

  return org;
}

/**
 * Create a test namespace (owned by either a user or organization)
 */
export async function createTestNamespace(
  owner: { userId: string } | { organizationId: string },
  data: Partial<NewNamespace> = {}
) {
  const db = getTestDb();
  const [namespace] = await db
    .insert(namespaces)
    .values({
      userOwnerId: 'userId' in owner ? owner.userId : null,
      organizationOwnerId: 'organizationId' in owner ? owner.organizationId : null,
      ...data,
    })
    .returning();

  return namespace;
}

/**
 * Add a user to an organization
 */
export async function addUserToOrganization(
  userId: string,
  organizationId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER'
) {
  const db = getTestDb();
  const [membership] = await db
    .insert(organizationMembers)
    .values({
      userId,
      organizationId,
      role,
    })
    .returning();

  return membership;
}

/**
 * Create a test runtime
 */
export async function createTestRuntime(data: Partial<NewRuntime> = {}) {
  const db = getTestDb();
  const [runtime] = await db
    .insert(runtimes)
    .values({
      configHash: data.configHash || generateUlidUuid(),
      config: data.config || { image_hash: 'sha256:test' },
      creationStatus: data.creationStatus || 'COMPLETED',
      ...data,
    })
    .returning();

  return runtime;
}

/**
 * Create a test workflow
 */
export async function createTestWorkflow(
  namespaceId: string,
  createdById: string | null = null,
  data: Partial<NewWorkflow> = {}
) {
  const db = getTestDb();
  const [workflow] = await db
    .insert(workflows)
    .values({
      name: data.name || `test-workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description: data.description || 'Test workflow',
      namespaceId,
      createdById,
      active: data.active ?? true,
      ...data,
    })
    .returning();

  return workflow;
}

/**
 * Create a test provider
 */
export async function createTestProvider(
  namespaceId: string,
  data: Partial<NewProvider> = {}
) {
  const db = getTestDb();
  const [provider] = await db
    .insert(providers)
    .values({
      namespaceId,
      type: data.type || 'builtin',
      alias: data.alias || 'default',
      encryptedConfig: data.encryptedConfig || 'encrypted-config-placeholder',
      ...data,
    })
    .returning();

  return provider;
}

/**
 * Create a test workflow deployment
 */
export async function createTestWorkflowDeployment(
  workflowId: string,
  runtimeId: string,
  deployedById: string | null = null,
  data: Partial<NewWorkflowDeployment> = {}
) {
  const db = getTestDb();
  const [deployment] = await db
    .insert(workflowDeployments)
    .values({
      workflowId,
      runtimeId,
      deployedById,
      userCode: data.userCode || {
        files: { 'main.ts': 'export default async function() { return "test"; }' },
        entrypoint: 'main.ts',
      },
      status: data.status || 'ACTIVE',
      ...data,
    })
    .returning();

  return deployment;
}

/**
 * Create a test subscription for an organization
 */
export async function createTestSubscription(
  organizationId: string,
  tier: 'FREE' | 'HOBBY' | 'TEAM' = 'FREE'
) {
  const db = getTestDb();
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      organizationId,
      tier,
      status: 'ACTIVE',
    })
    .returning();

  return subscription;
}

/**
 * Create a complete test setup with user, org, namespace, and workflow
 */
export async function createFullTestSetup() {
  const user = await createTestUser();
  const org = await createTestOrganization();
  await addUserToOrganization(user.id, org.id, 'OWNER');
  const namespace = await createTestNamespace({ organizationId: org.id });
  const workflow = await createTestWorkflow(namespace.id, user.id);
  const runtime = await createTestRuntime();
  const deployment = await createTestWorkflowDeployment(workflow.id, runtime.id, user.id);

  return {
    user,
    organization: org,
    namespace,
    workflow,
    runtime,
    deployment,
  };
}
